// src/components/Topbar.jsx
export default function Topbar({ title }) {
  return (
    <header className="topbarDash">
      <h1 className="topbarTitle">{title}</h1>
      <div className="topbarRight">
        <button className="ghostBtn">Settings</button>
      </div>
    </header>
  );
}
