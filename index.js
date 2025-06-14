const Framework = require('webex-node-bot-framework');
const webhook = require('webex-node-bot-framework/webhook');
const express = require('express');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

const BOT_TOKEN = process.env.WEBEX_BOT_TOKEN;
const ADMIN_USERS = process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',').map(s => s.trim()) : [];
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Optional SMTP configuration for email notifications
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
}

const pendingStatusRequests = {};
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
  sendNewFeatureCard(bot, trigger.personEmail);
});

framework.hears('/list', async (bot) => {
  try {
    const issues = await listJiraIssues();
    const table = makeAsciiTable(issues);
    await bot.say(`\n${table}`);
  } catch (e) {
    console.error('list error', e);
    bot.say('Failed to list issues');
  }
});

// Admin command to change status
framework.hears('/chstatus', (bot, trigger) => {
  const args = trigger.args.slice(1);
  const [issueKey, newStatus] = args;
  const reason = args.slice(2).join(' ');
  if (!issueKey || !newStatus || !reason) {
    bot.say('Usage: /chstatus JIRA_ID NEW_STATUS REASON');
    return;
  }

  if (ADMIN_USERS.includes(trigger.personEmail)) {
    changeStatus(issueKey, newStatus, reason, bot);
  } else {
    pendingStatusRequests[trigger.personEmail] = { issueKey, newStatus, reason };
    sendPasswordCard(bot);
  }
});

framework.on('attachmentAction', async (bot, trigger) => {
  const inputs = trigger.attachmentAction.inputs || {};
  if (inputs.featureName) {
    await handleNewFeature(bot, inputs);
  } else if (inputs.adminPassword) {
    await handlePassword(bot, trigger.personEmail, inputs.adminPassword);
  }
});

function sendNewFeatureCard(bot, email) {
  const card = {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'Input.Text', id: 'featureName', placeholder: 'Feature Name' },
        {
          type: 'Input.ChoiceSet',
          id: 'featureProduct',
          style: 'compact',
          choices: [
            { title: 'WxCC', value: 'WxCC' },
            { title: 'W/P/UCCE', value: 'W/P/UCCE' },
            { title: 'WxConnect Standalone', value: 'WxConnect Standalone' }
          ]
        },
        {
          type: 'Input.ChoiceSet',
          id: 'featureCategory',
          style: 'compact',
          choices: [
            { title: 'AI Agent', value: 'AI Agent' },
            { title: 'AI Assistant', value: 'AI Assistant' },
            { title: 'WxCampaign', value: 'WxCampaign' },
            { title: 'WxConnect', value: 'WxConnect' },
            { title: 'Flow Designer', value: 'Flow Designer' },
            { title: 'Analyzer', value: 'Analyzer' },
            { title: 'Call Recording', value: 'Call Recording' },
            { title: 'Telephony', value: 'Telephony' },
            { title: 'Agent/Supervisor desktop', value: 'Agent/Supervisor desktop' },
            { title: 'Control Hub', value: 'Control Hub' },
            { title: 'Journey Data Service', value: 'Journey Data Service' },
            { title: 'Other', value: 'Other' }
          ]
        },
        { type: 'Input.Text', id: 'featureDescription', isMultiline: true, placeholder: 'Description' },
        { type: 'Input.Text', id: 'opportunityLink', placeholder: 'Opportunity Salesforce Link' },
        { type: 'Input.Text', id: 'associatedJiras', placeholder: 'Associated JIRAs' },
        { type: 'Input.Text', id: 'interestedParties', placeholder: 'Interested Parties emails' },
        { type: 'Input.Text', id: 'submitter', value: email, isVisible: false }
      ],
      actions: [ { type: 'Action.Submit', title: 'Create' } ]
    }
  };
  bot.say({ markdown: 'Please fill the feature request details', attachments: [card] });
}

async function handleNewFeature(bot, inputs) {
  try {
    const key = await createJiraIssue(inputs);
    const link = `${process.env.JIRA_BASE_URL}/browse/${key}`;
    await bot.say(`Created JIRA issue ${key} - ${link}`);
    const recipients = [];
    if (inputs.submitter) recipients.push(inputs.submitter);
    if (inputs.interestedParties) {
      inputs.interestedParties.split(/[ ,]+/).forEach(e => e && recipients.push(e));
    }
    if (transporter && recipients.length > 0) {
      await transporter.sendMail({
        from: process.env.FROM_EMAIL || inputs.submitter,
        to: recipients.join(','),
        subject: `Feature request ${key}`,
        text: `Feature \"${inputs.featureName}\" created.\n${link}`
      });
    }
  } catch (e) {
    console.error('create feature error', e);
    bot.say('Failed to create JIRA issue');
  }
}

function sendPasswordCard(bot) {
  const card = {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [ { type: 'Input.Text', id: 'adminPassword', isPassword: true, placeholder: 'Password' } ],
      actions: [ { type: 'Action.Submit', title: 'Submit' } ]
    }
  };
  bot.say({ markdown: 'Admin password required', attachments: [card] });
}

async function handlePassword(bot, email, password) {
  const pending = pendingStatusRequests[email];
  if (!pending) return;
  if (password !== ADMIN_PASSWORD) {
    await bot.say('Invalid password');
    delete pendingStatusRequests[email];
    return;
  }
  delete pendingStatusRequests[email];
  await changeStatus(pending.issueKey, pending.newStatus, pending.reason, bot);
}

async function listJiraIssues() {
  const { JIRA_BASE_URL, JIRA_PROJECT_KEY, JIRA_USER_EMAIL, JIRA_API_TOKEN } = process.env;
  const credentials = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=project=${JIRA_PROJECT_KEY}&fields=summary,status&maxResults=50`;
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${credentials}` }
  });
  if (!response.ok) {
    throw new Error('search failed');
  }
  const data = await response.json();
  return data.issues.map(i => ({ key: i.key, summary: i.fields.summary, status: i.fields.status.name }));
}

function makeAsciiTable(rows) {
  const header = ['KEY', 'STATUS', 'SUMMARY'];
  const widths = [10, 15, 40];
  const pad = (s, w) => (s.length > w ? s.substring(0, w - 3) + '...' : s.padEnd(w));
  let out = `|${pad(header[0], widths[0])}|${pad(header[1], widths[1])}|${pad(header[2], widths[2])}|\n`;
  out += `|${'-'.repeat(widths[0])}|${'-'.repeat(widths[1])}|${'-'.repeat(widths[2])}|\n`;
  for (const r of rows) {
    out += `|${pad(r.key, widths[0])}|${pad(r.status, widths[1])}|${pad(r.summary, widths[2])}|\n`;
  }
  return out;
}

async function changeStatus(key, status, reason, bot) {
  const { JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN } = process.env;
  const credentials = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  // Get transitions
  let url = `${JIRA_BASE_URL}/rest/api/2/issue/${key}/transitions`;
  let resp = await fetch(url, { headers: { Authorization: `Basic ${credentials}` }});
  if (!resp.ok) throw new Error('transition fetch failed');
  const data = await resp.json();
  const transition = data.transitions.find(t => t.name.toLowerCase() === status.toLowerCase());
  if (!transition) {
    await bot.say('Invalid status');
    return;
  }
  // Perform transition
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
    body: JSON.stringify({ transition: { id: transition.id } })
  });
  // Add comment
  url = `${JIRA_BASE_URL}/rest/api/2/issue/${key}/comment`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
    body: JSON.stringify({ body: `Status changed to ${status}: ${reason}` })
  });
  await bot.say(`Status for ${key} changed to ${status}`);
}

async function createJiraIssue(fields) {
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
      summary: fields.featureName,
      description:
        `Feature Product: ${fields.featureProduct}\n` +
        `Feature Category: ${fields.featureCategory}\n` +
        `Description: ${fields.featureDescription}\n` +
        `Opportunity: ${fields.opportunityLink}\n` +
        `Associated JIRAs: ${fields.associatedJiras}\n` +
        `Submitter: ${fields.submitter}\n` +
        `Interested parties: ${fields.interestedParties}`,
      issuetype: { name: 'Task' }
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

app.use('/', webhook(framework));
const port = process.env.PORT || 3000;
app.listen(port, () => {
  framework.start();
  console.log(`Bot listening on port ${port}`);
});
