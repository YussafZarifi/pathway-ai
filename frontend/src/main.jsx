import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";              // global styles (Aurora + quiz + results)
import "./styles/dashboard.css";   // dashboard theme (Option B)
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
