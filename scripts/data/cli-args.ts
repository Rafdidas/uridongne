export function parseNamedArgs(argv: string[], required: readonly string[], optional: readonly string[] = []): Record<string, string> {
  const values: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value pairs, received: ${argv.join(" ")}`);
    }

    const name = flag.slice(2);
    if (values[name] !== undefined) throw new Error(`Repeated argument: --${name}`);
    values[name] = value;
  }

  for (const name of required) {
    if (values[name] === undefined) throw new Error(`Missing argument: --${name}`);
  }

  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(values).filter((name) => !allowed.has(name));
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);

  return values;
}
