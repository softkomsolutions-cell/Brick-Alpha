/**
 * Test-only ESM loader: lets plain Node resolve the bare (extensionless)
 * relative imports that Vite allows in frontend/src by trying `./x.js`.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../"))
    ) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}