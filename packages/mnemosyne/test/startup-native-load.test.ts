import { describe, expect, it } from "bun:test";
import * as path from "node:path";

const packageDir = path.join(import.meta.dir, "..");

async function readPipe(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	if (!stream) return "";
	return new Response(stream).text();
}

describe("startup native loading", () => {
	it("does not load onnxruntime when the package root is imported", async () => {
		const probe = `
const loaded = [];
const originalDlopen = process.dlopen;
process.dlopen = function(module, filename, flags) {
	loaded.push(String(filename));
	return originalDlopen.call(this, module, filename, flags);
};
await import("./src/index.ts");
process.stdout.write(JSON.stringify(loaded));
`;
		const proc = Bun.spawn([process.execPath, "-e", probe], {
			cwd: packageDir,
			env: { ...Bun.env, BUN_ENV: "test", NODE_ENV: "test" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			readPipe(proc.stdout as ReadableStream<Uint8Array> | null),
			readPipe(proc.stderr as ReadableStream<Uint8Array> | null),
			proc.exited,
		]);
		if (exitCode !== 0) {
			throw new Error(`startup probe failed with exit ${exitCode}: ${stderr}`);
		}

		const loaded = JSON.parse(stdout) as string[];
		expect(loaded.filter(item => item.includes("onnxruntime"))).toEqual([]);
	});
});
