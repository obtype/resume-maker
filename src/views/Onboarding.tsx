interface Props {
  busy: boolean;
  error: string;
  supported: boolean;
  onChoose: () => void;
}

export function Onboarding({ busy, error, supported, onChoose }: Props) {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <span className="brand-mark large">CV</span>
        <h1>CV Studio</h1>
        <p className="lead">
          A local-first workbench for turning your profile and a job description into a tailored,
          one-page CV.
        </p>
        <div className="onboarding-steps">
          <div><strong>1</strong><span>Choose a workspace folder. Every application becomes a subfolder with its prompt, raw LLM response, CV JSON, and exports.</span></div>
          <div><strong>2</strong><span>Import your personal data record and fill in your contact details once.</span></div>
          <div><strong>3</strong><span>Paste a job description, generate the prompt, and use it with any LLM.</span></div>
          <div><strong>4</strong><span>Paste the response back, validate it, adjust the CV, and save a PDF.</span></div>
        </div>
        {!supported && (
          <p className="callout error">
            This browser does not expose the File System Access API. Use desktop Chrome or Edge.
          </p>
        )}
        {error && <p className="callout error">{error}</p>}
        <button className="primary large" onClick={onChoose} disabled={!supported || busy}>
          {busy ? "Opening…" : "Choose workspace folder"}
        </button>
        <p className="fineprint">
          Your data stays on your machine. CV Studio has no backend, no analytics, and never uploads
          anything. The only data that leaves your computer is what you paste into an LLM.
        </p>
      </div>
    </div>
  );
}
