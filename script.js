fetch("http://localhost:3000/api/status")
  .then(response => response.json())
  .then(data => {
    console.log("Backend connected:", data);
  })
  .catch(error => {
    console.error("Backend connection error:", error);
  });