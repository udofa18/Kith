import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { fetchComponentMetadata } from './api.js';
import { downloadAndExtract, detectPackageManager, detectProjectType } from '../utils/fileHandler.js';

export async function addComponent(slug) {
  console.log(chalk.bold.cyan('\n🚀 Kith CLI v1.0.0\n'));

  const spinner = ora('Fetching component metadata...').start();

  try {
    // 1. Fetch Metadata
    const metadata = await fetchComponentMetadata(slug);
    spinner.succeed(`Found component: ${chalk.green(metadata.name)}`);

    // 2. Detect Environment
    const projectType = await detectProjectType();
    const packageManager = await detectPackageManager();
    
    console.log(chalk.dim(`   Project: ${projectType} | Manager: ${packageManager}\n`));

    // 3. Download Files
    spinner.start(`Downloading files to ./components/${slug}...`);
    const targetDir = path.join(process.cwd(), 'components', slug);
    
    if (await fs.pathExists(targetDir)) {
      spinner.stop();
      console.log(chalk.yellow(`⚠️  Warning: Directory ./components/${slug} already exists.`));
      // In a real CLI, we might use 'prompts' here to ask to overwrite
    }

    await downloadAndExtract(metadata.repo, targetDir, metadata.filesPath);
    spinner.succeed(`Files installed at ${chalk.bold(`./components/${slug}`)}`);

    // 4. Install Dependencies
    if (metadata.dependencies?.length > 0) {
      spinner.start(`Installing dependencies: ${metadata.dependencies.join(', ')}...`);
      
      const installCmd = packageManager === 'npm' ? 'install' : 'add';
      await execa(packageManager, [installCmd, ...metadata.dependencies]);
      
      spinner.succeed('Dependencies installed successfully');
    }

    // 5. Success Message
    console.log('\n' + chalk.bold.green('✨ Installation Complete!'));
    console.log(`\nTo use this component, import it in your project:`);
    console.log(chalk.cyan(`   import { ${metadata.name} } from './components/${slug}';`));
    console.log('\n' + chalk.dim('Happy coding! 🚀\n'));

  } catch (error) {
    spinner.fail(`Installation failed: ${error.message}`);
    throw error;
  }
}
