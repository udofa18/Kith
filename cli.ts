#!/usr/bin/env node
import { Command } from 'commander';
import axios from 'axios';
import admZip from 'adm-zip';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

const program = new Command();

const API_URL = process.env.MARKETPLACE_API_URL || 'https://ais-dev-pl5m3svvzywa22alru7kzb-614039383861.europe-west2.run.app';

program
  .name('kith')
  .description('CLI to install components from Kith Network')
  .version('1.0.0');

program
  .command('add <slug>')
  .description('Add a component to your project')
  .action(async (slug) => {
    console.log(chalk.blue(`🔍 Searching for component: ${slug}...`));

    try {
      // 1. Fetch metadata
      const response = await axios.get(`${API_URL}/api/components/${slug}`);
      const component = response.data;

      console.log(chalk.green(`✅ Found: ${component.name}`));
      console.log(chalk.blue(`📦 Downloading from ${component.repo}...`));

      // 2. Download ZIP from GitHub
      // Convert https://github.com/user/repo to https://github.com/user/repo/archive/refs/heads/main.zip
      const zipUrl = `${component.repo.replace(/\/$/, '')}/archive/refs/heads/main.zip`;
      const zipResponse = await axios.get(zipUrl, { responseType: 'arraybuffer' });
      const zip = new admZip(Buffer.from(zipResponse.data));

      // 3. Extract relevant files
      const tempDir = path.join(process.cwd(), '.temp-marketplace');
      zip.extractAllTo(tempDir, true);

      // Find the extracted folder (usually repo-main)
      const extractedFolders = fs.readdirSync(tempDir);
      const repoFolder = extractedFolders[0];
      const sourcePath = path.join(tempDir, repoFolder, component.filesPath);
      const destPath = path.join(process.cwd(), 'components', slug);

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Path ${component.filesPath} not found in repository.`);
      }

      // 4. Inject into project
      await fs.ensureDir(path.dirname(destPath));
      await fs.copy(sourcePath, destPath);

      // 5. Cleanup
      await fs.remove(tempDir);

      console.log(chalk.green(`\n🚀 Successfully installed ${component.name}!`));
      console.log(chalk.white(`📍 Location: /components/${slug}`));
      
      if (component.dependencies && component.dependencies.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Don't forget to install dependencies:`));
        console.log(chalk.cyan(`npm install ${component.dependencies.join(' ')}`));
      }

    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      if (error.response?.status === 404) {
        console.error(chalk.red(`Component "${slug}" not found in the marketplace.`));
      }
    }
  });

program.parse();
