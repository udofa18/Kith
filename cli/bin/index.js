#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { addComponent } from '../lib/install.js';

const program = new Command();

program
  .name('kith')
  .description('CLI to install components from Kith Network')
  .version('1.0.0');

program
  .command('add')
  .description('Add a component to your project')
  .argument('<slug>', 'component slug to install')
  .action(async (slug) => {
    try {
      await addComponent(slug);
    } catch (error) {
      console.error(chalk.red('\n✖ Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();
