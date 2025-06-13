const Framework = require('webex-node-bot-framework');
const express = require('express');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.WEBEX_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('WEBEX_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const framework = new Framework({ token: BOT_TOKEN });
const app = express();

framework.on('initialized', () => {
  console.log('Framework initialized');
});

framework.hears('/new', (bot, trigger) => {
  const summary = trigger.args.slice(1).join(' ') || 'New feature request';
  createJiraIssue(summary, trigger.personEmail)
    .then(issueKey => bot.say(`Created JIRA issue ${issueKey}`))
    .catch(err => {
      console.error('JIRA create error', err);
      bot.say('Failed to create JIRA issue');
    });
});

async function createJiraIssue(summary, reporter) {
  const {
    JIRA_BASE_URL,
    JIRA_PROJECT_KEY,
    JIRA_USER_EMAIL,
    JIRA_API_TOKEN
  } = process.env;

  if (!JIRA_BASE_URL || !JIRA_PROJECT_KEY || !JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
    throw new Error('JIRA environment variables are not set');
  }

  const credentials = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const url = `${JIRA_BASE_URL}/rest/api/2/issue`;

  const body = {
    fields: {
      project: { key: JIRA_PROJECT_KEY },
      summary: summary,
      description: `Feature request from ${reporter}`,
      issuetype: { name: 'Task' }
      // Additional fields can be provided here
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.key;
}

app.use('/', framework.webhook());
const port = process.env.PORT || 3000;
app.listen(port, () => {
  framework.start();
  console.log(`Bot listening on port ${port}`);
});
