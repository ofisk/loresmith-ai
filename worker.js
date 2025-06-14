export default {
  async fetch(request) {
    return new Response("LoreSmith A2A entrypoint alive!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};

