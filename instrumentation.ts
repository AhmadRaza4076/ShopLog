export async function register() {
  if (process.env.NODE_ENV !== 'development') return;

  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    const msg = err?.message ?? '';
    const isStaleChunk =
      err?.code === 'MODULE_NOT_FOUND' && /\.\/\d+\.js/.test(msg);

    if (!isStaleChunk) return;

    console.error('\n⚠ Stale webpack chunk detected (see dev terminal for auto-restart).\n');
  });
}
