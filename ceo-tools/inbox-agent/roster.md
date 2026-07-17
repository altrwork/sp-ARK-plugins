# sp-ARK Inbox Agent — Roster

Static, human-maintained. The agent's system prompt (`inbox-agent.agent.yaml`) embeds a
copy of this — if you change who owns what, update both this file and the `system:`
block in the agent YAML, then `ant beta:agents update` to publish a new version.

| Person | Role | Owns |
|---|---|---|
| Jarred Robidoux (jarred@altrwork.com) | AI Coordinator | Automations, Claude/AI tooling, technical builds |
| Caitlin (caitlinr@sp-ark-labs.com) | Marketing | Marketing, websites, content, event/sponsorship materials |
| Cassandra (bernardc@sp-ark-labs.com) | Marketing | Marketing, websites, content, event/sponsorship materials |
| Edwin (deeke@tbinnovates.com) | Operations Manager | Building operations, access/security |
| Larry | Building Manager | Physical building/facilities matters |
| Ed | Community Lead | All things spARK Labs community | Member events

## Open items

- **Cassandra's email address is unknown.** Not present in any config we've checked so
  far (Operations Worker `ALLOWED_EMAILS`, CEO Tools worker). Get it from Becca before
  the agent needs to address her directly in a draft — until then the agent will name
  her in the draft body but may not be able to add her as a recipient.
