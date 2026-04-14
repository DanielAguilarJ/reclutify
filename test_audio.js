const apiKey = process.env.OPENROUTER_API_KEY || "YOUR_OPENROUTER_API_KEY";
async function test() {
  const req = {
    model: "openai/gpt-audio-mini",
    messages: [{ role: "user", content: "Say the word Yes" }],
    modalities: ["text", "audio"],
    audio: { voice: "alloy", format: "pcm16" },
    stream: true
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  while(true) {
    const {done, value} = await reader.read();
    if(done) break;
    const text = decoder.decode(value);
    console.log("CHUNK:", text);
    received++;
    if(received > 3) break;
  }
}
test();
