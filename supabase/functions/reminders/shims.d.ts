// For type-checking outside Deno: the npm: import the Supabase runtime resolves itself.
declare module 'npm:web-push@3.6.7' {
  const webpush: unknown;
  export default webpush;
}
