# cxocoefeaturebot

This project contains a Webex messaging bot that manages feature requests in JIRA.  It supports creating new requests via an Adaptive Card, listing existing requests and changing their status.

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
- `ADMIN_USERS` – comma separated list of admin email addresses
- `ADMIN_PASSWORD` – password required for non admin users to change status
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (optional) – SMTP details for email notifications
- `FROM_EMAIL` (optional) – address used as sender
- `PORT` (optional) – port the bot listens on (default `3000`)

Run the bot:

```bash
npm start
```

## Usage

Commands supported by the bot:

- `/new` – the bot will display an Adaptive Card where you can fill out the feature details. After submitting the card a JIRA task is created and notifications are sent.
- `/list` – lists the existing feature requests with their status in a simple ASCII table.
- `/chstatus [JIRA_ID] [NEW_STATUS] [REASON]` – change the status of a feature request.  If the requester is not an admin they will be prompted for the admin password using a card.

The mapping of JIRA fields can be adjusted in `index.js`.
