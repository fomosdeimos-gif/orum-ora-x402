module.exports = (req, res) => {
  // Serve the MCPv1 domain-ownership proof record for registry.modelcontextprotocol.io
  // HTTP authentication. Vercel does not serve static files under a leading-dot
  // directory reliably (same reason .well-known/x402.json is proxied, not static),
  // so this mirrors that pattern instead of a plain file.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send('v=MCPv1; k=ed25519; p=TM5MPb99loYa9aA0mMp02Dy/cmyPQH+B8oiwyPptIKo=\n');
};
