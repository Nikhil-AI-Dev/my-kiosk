import { useEffect, useState } from "react";

function App() {
  const [ping, setPing] = useState("ready");

  useEffect(() => {
    // Example: read an env var (configure on Netlify later)
    // eslint-disable-next-line no-undef
    const apiBase = import.meta.env.VITE_API_BASE_URL || "(not set)";
    console.log("API Base:", apiBase);
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>My Kiosk</h1>
      <p>Status: {ping}</p>
      <p>Deploy target: Netlify</p>
      <p>
        Env example: <code>VITE_API_BASE_URL</code> is read at build-time.
      </p>
      <button onClick={() => setPing("clicked!")}>Test Button</button>
    </main>
  );
}

export default App;
