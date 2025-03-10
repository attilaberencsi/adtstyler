#!/usr/bin/env node
import chalk from 'chalk';
import { createRequire } from 'module';
import { select, input } from '@inquirer/prompts';
import Styler from '../lib/Styler.mjs';
import { MESSAGE_SEVERITY } from '../lib/Constants.mjs';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

console.log(chalk.blue(`ADT Styler v${version}`));

// Main menu prompt
const action = await select({
  message: 'What would you like to do?',
  choices: [
    { name: 'Patch Eclipse Styles', value: 'patch' },
    { name: 'Restore Eclipse Styles', value: 'restore' }
  ]
});

if (action === 'patch') {
  await handlePatchFlow();
} else {
  await handleRestoreFlow();
}

async function handlePatchFlow() {
  const directory = await input({
    message: 'Enter Eclipse Directory:',
    validate: input => input.length > 0
  });

  const backupdir = await input({
    message: 'Enter Backup Directory:',
    validate: input => input.length > 0
  });

  const theme = await select({
    message: 'Select theme:',
    choices: [{ name: 'dark', value: 'dark' }]
  });

  // Get styles for selected theme
  const themeStyles = await Styler.listThemeStyles(theme);
  
  const style = await select({
    message: 'Select style to apply:',
    choices: themeStyles.map(style => ({ name: style, value: style }))
  });

  try {
    const styler = new Styler(directory, backupdir);
    const messages = await styler.patch(theme, style);
    consoleLogMessages(messages);
  } catch (error) {
    console.error(chalk.red.inverse(error.toString()));
  }
}

async function handleRestoreFlow() {
  const directory = await input({
    message: 'Enter Eclipse Directory:',
    validate: input => input.length > 0
  });

  const backupdir = await input({
    message: 'Enter Backup Directory:',
    validate: input => input.length > 0
  });

  try {
    const styler = new Styler(directory, backupdir);
    const messages = await styler.restore();
    consoleLogMessages(messages);
  } catch (error) {
    console.error(chalk.red.inverse(error.toString()));
  }
}

/**
 * Print messages to the console with different colors based on the severity.
 * @param {*} messages 
 */
function consoleLogMessages(messages) {
  messages.forEach(message => {
    switch (message.severity) {
      case MESSAGE_SEVERITY.SUCCESS:
        console.info(chalk.green(message.text));
        break;
      case MESSAGE_SEVERITY.INFO:
        console.info(chalk.blue(message.text));
        break;
      case MESSAGE_SEVERITY.WARNING:
        console.warn(chalk.yellow(message.text));
        break;
      case MESSAGE_SEVERITY.ERROR:
        console.error(chalk.red.inverse(message.text));
        break;
      default:
        console.log(message.text);
    }
  });
}