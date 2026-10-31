import { useState } from "react";
import "./App.css";

type Mode =
  | "web"
  | "academic"
  | "reddit"
  | "image"
  | "video"
  | "youtube"
  | "writing";

function App() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("web");

  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const modes: { id: Mode; label: string }[] = [
    { id: "web", label: "Web" },
    { id: "academic", label: "Academic" },
    { id: "reddit", label: "Reddit" },
    { id: "image", label: "Images" },
    { id: "video", label: "Video" },
    { id: "youtube", label: "YouTube" },
    { id: "writing", label: "Writing" },
  ];

  const handleSearch = async () => {
  if (!query.trim() || loading) return;

  setLoading(true);
  setAnswer("");
  setSources([]);
  setError("");

  try {
    const response = await fetch("https://perplexity-clone-1-bw62.onrender.com/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: query,
        history: [],
        mode: mode,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body received");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");

      buffer = events.pop() || "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((line) => line.startsWith("data: "));

        if (!line) continue;

        const jsonString = line.replace("data: ", "");

        try {
          const data = JSON.parse(jsonString);

          if (data.type === "response") {
            setAnswer((previous) => previous + (data.data || ""));
          }

          if (data.type === "sources") {
            setSources(data.data || []);
          }

          if (data.type === "error") {
            setError(data.data || "Something went wrong");
          }
        } catch (parseError) {
          console.error("SSE JSON parse error:", parseError);
        }
      }
    }
  } catch (err) {
    console.error(err);

    setError(
      err instanceof Error
        ? err.message
        : "Unable to connect to backend"
    );
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="app">
      <header className="navbar">
        <div className="brand">
          <div className="brand-icon">F</div>
          <span>FutureSearch</span>
        </div>

        <button className="github-btn">GitHub</button>
      </header>

      <main className="main">
        <section className="hero-section">
          <div className="logo-circle">✦</div>

          <h1>What do you want to know?</h1>

          <p className="subtitle">
            Search the web, explore research, and get AI-powered answers.
          </p>

          <div className="search-box">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Ask anything..."
              rows={1}
            />

            <button
              className="search-button"
              onClick={handleSearch}
              disabled={!query.trim()}
            >
              ↑
            </button>
          </div>

          <div className="mode-selector">
            {modes.map((item) => (
              <button
                key={item.id}
                className={`mode-button ${
                  mode === item.id ? "active" : ""
                }`}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="suggestions">
          <h2>Try asking</h2>

          {loading && (
  <div className="loading">
    Searching...
  </div>
)}

{error && (
  <div className="error-box">
    {error}
  </div>
)}

{answer && (
  <section className="answer-section">
    <h2>Answer</h2>

    <div className="answer">
      {answer}
    </div>

    {sources.length > 0 && (
      <div className="sources">
        <h3>Sources</h3>

        <div className="source-grid">
          {sources.map((source, index) => (
            <a
              key={index}
              href={source.metadata?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-card"
            >
              <strong>
                {source.metadata?.title || `Source ${index + 1}`}
              </strong>

              <p>
                {source.pageContent?.slice(0, 160)}
                {source.pageContent?.length > 160 ? "..." : ""}
              </p>
            </a>
          ))}
        </div>
      </div>
    )}
  </section>
)}

{mode === "image" && sources.length > 0 && (
  <section className="image-results">
    <h2>Images</h2>

    <div className="image-grid">
      {sources.map((source) => (
        source.img_src && (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="image-card"
          >
            <img
              src={source.img_src}
              alt={source.title || "Search result"}
              loading="lazy"
            />

            <p>{source.title}</p>
          </a>
        )
      ))}
    </div>
  </section>
)}

          <div className="suggestion-grid">
            <button onClick={() => setQuery("What is Artificial Intelligence?")}>
              What is Artificial Intelligence?
            </button>

            <button onClick={() => setQuery("Explain RAG in simple terms")}>
              Explain RAG in simple terms
            </button>

            <button onClick={() => setQuery("Best React course for beginners")}>
              Best React course for beginners
            </button>

            <button onClick={() => setQuery("Latest research on LLMs")}>
              Latest research on LLMs
            </button>
          </div>
        </section>
      </main>

      <footer>
        <p>FutureSearch · AI-powered search assistant</p>
      </footer>
    </div>
  );
}

export default App;