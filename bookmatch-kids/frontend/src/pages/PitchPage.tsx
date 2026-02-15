import { useState } from "react";
import { chatBooks, createRequest } from "../api";

export default function PitchPage() {
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  async function handleDemo() {
    setDemoLoading(true);
    setDemoMessage(null);
    try {
      const sample = "funny animals in space for a 7 year old";
      const data = await chatBooks({ text: sample, age: 7 });
      const matches = (data.matches || []).map((book) => ({
        book_id: book.id,
        score: book.score ?? 0,
      }));
      if (matches.length === 0) {
        setDemoMessage("No matches found. Try seeding the database.");
        return;
      }
      await createRequest({
        raw_text: sample,
        parsed_preferences: data.parsed,
        matched: matches,
      });
      setDemoMessage("Demo request created. Check Staff or Volunteer view.");
    } catch (err) {
      setDemoMessage(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>BookMatch Kids — Elevator Pitch</h2>
      <p>
        We built a kid‑friendly book request app: kids describe the book they want in plain language,
        Gemini turns that into structured preferences, and we match them to in‑stock books. Volunteers
        get a simple dashboard that converts those requests into pick lists, so distribution is faster,
        more organized, and reaches more families.
      </p>

      <div className="panel-sub">
        <h3>Demo Script (2–3 minutes)</h3>
        <ol>
          <li>Kid View: type “funny animals in space for a 7‑year‑old” → click Find books.</li>
          <li>Show results, then click Request selected.</li>
          <li>Switch to Staff View → select the new request.</li>
          <li>Change status: approved → picked → packed → distributed.</li>
          <li>Open picklist; optionally Read picklist for accessibility.</li>
        </ol>
      </div>

      <div className="panel-sub">
        <h3>Why It Matters</h3>
        <ul>
          <li>Kids get books that match their interests and reading level.</li>
          <li>Volunteers can fulfill requests quickly with fewer errors.</li>
          <li>Accessibility is built‑in with TTS read‑aloud features.</li>
        </ul>
      </div>

      <div className="panel-sub">
        <h3>One‑Click Demo</h3>
        <p>Creates a sample request for staff to fulfill.</p>
        <div className="field-row">
          <button onClick={handleDemo} disabled={demoLoading}>
            {demoLoading ? "Creating..." : "Create demo request"}
          </button>
          {demoMessage ? <span className="muted">{demoMessage}</span> : null}
        </div>
      </div>
    </section>
  );
}
