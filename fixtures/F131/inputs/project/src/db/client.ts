// The database client; the driver itself is left out of this fixture.
export const query = (sql: string): Promise<string[]> => Promise.resolve([sql]);
