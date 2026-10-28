export async function send(url: string): Promise<Response> {
  return fetch(url);
}
