import type { Recipient } from "../core/deliverables/types";

interface Props {
  recipient: Recipient;
  onChange: (patch: Partial<Recipient>) => void;
}

/**
 * Recipient context for cold email and LinkedIn message deliverables. The
 * profile/about/posts fields are third-party personal data, so the privacy note
 * stays next to the inputs.
 */
export function RecipientFields({ recipient, onChange }: Props) {
  return (
    <div className="recipient-fields">
      <div className="recipient-grid">
        <label className="field">
          <span>Name</span>
          <input
            value={recipient.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Jordan Example"
          />
        </label>
        <label className="field">
          <span>Role</span>
          <input
            value={recipient.role}
            onChange={(event) => onChange({ role: event.target.value })}
            placeholder="Head of Engineering"
          />
        </label>
        <label className="field">
          <span>Company</span>
          <input
            value={recipient.company}
            onChange={(event) => onChange({ company: event.target.value })}
            placeholder="Globex"
          />
        </label>
        <label className="field">
          <span>Profile URL</span>
          <input
            value={recipient.profileUrl}
            onChange={(event) => onChange({ profileUrl: event.target.value })}
            placeholder="https://www.linkedin.com/in/jordan-example"
          />
        </label>
        <label className="field wide">
          <span>About / profile text</span>
          <textarea
            rows={4}
            value={recipient.about}
            onChange={(event) => onChange({ about: event.target.value })}
            placeholder="Paste the recipient's profile summary or about section."
          />
        </label>
        <label className="field wide">
          <span>Recent posts</span>
          <textarea
            rows={4}
            value={recipient.posts}
            onChange={(event) => onChange({ posts: event.target.value })}
            placeholder="Paste recent posts that are relevant to the message."
          />
        </label>
        <label className="field wide">
          <span>Relationship / context</span>
          <textarea
            rows={2}
            value={recipient.relationship}
            onChange={(event) => onChange({ relationship: event.target.value })}
            placeholder="e.g. We met at the Edge AI meetup in May."
          />
        </label>
        <label className="field wide">
          <span>Intent</span>
          <textarea
            rows={2}
            value={recipient.intent}
            onChange={(event) => onChange({ intent: event.target.value })}
            placeholder="e.g. Ask for a 20-minute intro call about the perception team."
          />
        </label>
      </div>
      <p className="fineprint privacy-note">
        Recipient profile and post text is third-party personal data and will be sent to the LLM.
        Include only what the message needs.
      </p>
    </div>
  );
}
