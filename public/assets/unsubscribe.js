(function () {
  const show = (id) => document.querySelectorAll("main [id^='state-']").forEach((el) => { el.hidden = el.id !== "state-" + id; });
  document.addEventListener("DOMContentLoaded", () => {
    const p = new URLSearchParams(location.search);
    const btn = document.getElementById("unsub-btn");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Unsubscribing…";
      const res = await window.MMB_API.fn("unsubscribe", { id: p.get("id"), sig: p.get("sig") });
      show(res.ok && res.data.status === "unsubscribed" ? "done" : "error");
    });
  });
})();
