
const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function createPolice(payload) {
  const response = await fetch(
    `${API_URL}/api/polices`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : JSON.stringify(result.detail)
    );
  }

  return result;
}
