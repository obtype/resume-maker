# CV Studio

A local-first application for turning a personal data record and a job description into a tailored CV and related application deliverables.

## Language

**Workspace**
The folder the user grants the app access to; holds settings, the default profile, and all projects.
_Avoid_: Vault, directory, repo

**Project**
One application or outreach effort inside a workspace: the job or recipient it targets, the deliverables requested, and the prompts and responses that produced them.
_Avoid_: CV, document, job

**Deliverable**
One output the user asks the model to produce for a project: a CV, a cover letter, a cold email, or a LinkedIn message.
_Avoid_: Document, output, artifact

**Recipient**
The person an outreach deliverable is addressed to, described by whatever profile details, about text, posts, and intent the user supplies.
_Avoid_: Contact, lead, target

**Cover letter**
A letter tailored to one job and addressed to its employer, submitted alongside or instead of a CV.
_Avoid_: Motivation letter, application letter

**Cold email**
An unsolicited email to a person at a target company, written without an existing relationship.
_Avoid_: Outreach email, recruiter email

**LinkedIn message**
A follow-up message sent after a LinkedIn connection request has been accepted.
_Avoid_: Connection note, DM, InMail

**PDR**
Personal data record. The imported markdown profile of the candidate's background, deliberately without contact details.
_Avoid_: Profile, resume, CV

**Cv content**
The tailorable facts of a CV — name, contact details, roles, projects, skills — and nothing about how they look. Stored as JSON and validated against a schema.
_Avoid_: CV data, resume, payload

**Cv style**
Presentation settings for one renderer: type scale, spacing, margins, sidebar width, accent, and saved inline formatting.
_Avoid_: Theme, skin, design

**Renderer**
A pure module that turns Cv content and Cv style into page HTML. It never touches the DOM, storage, or timers.
_Avoid_: Template, layout, view

**Schema**
The JSON contract shared by the prompt, the normalizer, the validator, and the renderer's declared compatibility.
_Avoid_: Shape, format, spec

**Contact detail**
One entry in the CV's contact list, such as an email address, a phone number, or a profile URL.
_Avoid_: Contact field, contact info, link

**Field**
A value the user can edit directly in the preview, identified by a JSON path into the CV content.
_Avoid_: Cell, element, input

**Field text**
The plain text of a field. It is the value written back to the CV content when the user edits, and it is what the drift guard compares against.
_Avoid_: Inner text, raw text, value

**Saved field HTML**
Rich formatting captured for a field when it was last edited, kept in Cv style rather than in Cv content.
_Avoid_: Rich text, formatted text, markup

**Drift guard**
The rule that saved field HTML is only used while its saved field text still matches the current field text; otherwise the field falls back to plain text.
_Avoid_: Staleness check, hash check

**Link**
A run of field text that renders as an anchor rather than plain characters.
_Avoid_: Hyperlink, URL, anchor

**Link target**
The absolute `http(s)` or `mailto` destination a link resolves to. Distinct from the text shown to the reader.
_Avoid_: href, URL, destination

**Redirect wrapper**
A URL whose only purpose is to carry another URL in a query parameter, such as a Google search or redirect link. Its inner URL is the real link target.
_Avoid_: Tracker, proxy link, shortlink
