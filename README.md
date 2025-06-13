# cxocoefeaturebot

This project contains a simple Webex messaging bot written in Node.js. It listens for the `/new` command and creates a JIRA task for tracking feature requests.

## Prerequisites

- Node.js 16+
- A Webex bot access token
- Credentials for your JIRA instance

## Setup

Install dependencies:

```bash
npm install
```

Set the following environment variables:

- `WEBEX_BOT_TOKEN` – token for your Webex bot
- `JIRA_BASE_URL` – base URL of your JIRA instance, e.g. `https://your-domain.atlassian.net`
- `JIRA_PROJECT_KEY` – key of the project where issues should be created
- `JIRA_USER_EMAIL` – account email for API access
- `JIRA_API_TOKEN` – API token for the account
- `PORT` (optional) – port the bot listens on (default `3000`)

Run the bot:

```bash
npm start
```

## Usage

Send `/new <summary>` to your bot in Webex. The bot will create a new JIRA issue using the provided summary. The issue description will include the email address of the requester.

Further JIRA fields can be customized in `index.js` inside `createJiraIssue`.
