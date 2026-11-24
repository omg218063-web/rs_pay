async function checkStatus() {
  const status = document.getElementById("status");

  try {
    const response = await fetch("/health");
    const data = await response.json();

    status.textContent =
      data.status === "ok"
        ? "RS PAY Server Online"
        : "Server unavailable";

  } catch (error) {
    status.textContent = "Unable to connect to server";
  }
}

checkStatus();
