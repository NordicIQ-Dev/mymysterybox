(function () {
  const show = (id) => document.querySelectorAll("main [id^='state-']").forEach((el) => { el.hidden = el.id !== "state-" + id; });
  document.addEventListener("DOMContentLoaded", async () => {
    const token = new URLSearchParams(location.search).get("token") || "";
    // Confirm with a POST from JavaScript: email link scanners only GET the page, so they can't confirm for someone.
    const res = await window.MMB_API.fn("confirm", { token });
    if (res.ok && res.data.status === "confirmed") {
      if (res.data.giveawayEntered) document.getElementById("confirmed-text").textContent = "Your entry is locked in for the draw. We'll email the winner on the draw date, and everyone on the list gets early access at launch.";
      show("confirmed");
    } else if (res.data.status === "expired") show("expired");
    else if (res.data.status === "invalid") show("invalid");
    else show("error");
  });
})();
