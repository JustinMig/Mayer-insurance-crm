# Life Import Manual Name + Agent Requirement V2

Clean rebuild from the last working CRM source.

Behavior:
- First Name always starts blank after document scanning.
- Last Name always starts blank after document scanning.
- PDF/OCR extraction never populates those two fields.
- Assigned Agent always starts blank.
- No agent is preselected.
- The agent dropdown always includes a blank `Select an agent` option.
- Admin/manager users can select from allowed agents.
- Regular agents must explicitly select themselves from their one permitted option.
- CREATE CLIENT & SAVE FILES remains disabled until:
  - First Name is entered
  - Last Name is entered
  - Assigned Agent is selected
  - At least one valid life insurance document is scanned
  - No document remains unclassified

No `assigned_agent_id` field was added to `ClientDocumentDraft`; agent assignment continues to use the existing `assignedAgentId` state and form field.

All prior working life-policy, banking, document upload, and explicit Life Insurance save fixes remain included.
