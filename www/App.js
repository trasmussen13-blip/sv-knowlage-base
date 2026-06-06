async function submitIncident() {

  const data = {
    id: generateId(),
    platform: document.getElementById("platform").value,

    symptoms: document.getElementById("symptoms").value.split("\n").filter(Boolean),

    mechanism: document.getElementById("mechanism").value,
    root_cause: document.getElementById("rootCause").value,

    contra_indicators: {
      present: document.getElementById("contraPresent").value.split("\n").filter(Boolean),
      absent: document.getElementById("contraAbsent").value.split("\n").filter(Boolean)
    },

    intervention: document.getElementById("intervention").value,

    created_at: new Date().toISOString()
  };

  console.log("Incident:", data);

  document.getElementById("status").innerText =
    "Saved locally (next step: Git commit integration)";
}

function generateId() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-");
}
