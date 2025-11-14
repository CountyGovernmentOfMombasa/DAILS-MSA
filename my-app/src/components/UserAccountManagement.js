import React, { useState } from "react";

const UserAccountManagement = () => {
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const adminToken = localStorage.getItem("adminToken");

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError("");
    setUser(null);
    setActionMessage("");
    try {
      const res = await fetch(
        `/api/admin/users/lookup?nationalId=${encodeURIComponent(
          search.trim()
        )}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUser(data.user);
      } else {
        setError("User not found.");
      }
    } catch (err) {
      setError("Failed to search for user.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user) return;
    if (
      !window.confirm(
        `Are you sure you want to reset the password for ${user.first_name} ${user.surname}?`
      )
    )
      return;
    setLoading(true);
    setError("");
    setActionMessage("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage(
          "Password has been successfully reset to the default."
        );
      } else {
        throw new Error(data.message || "Failed to reset password.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockAccount = async () => {
    if (!user) return;
    if (
      !window.confirm(
        `Are you sure you want to unlock the account for ${user.first_name} ${user.surname}?`
      )
    )
      return;
    setLoading(true);
    setError("");
    setActionMessage("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/clear-lockout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage("User account has been unlocked.");
      } else {
        throw new Error(data.message || "Failed to unlock account.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-dark text-white">
        <h5 className="mb-0">
          <i className="bi bi-person-gear me-2"></i>User Account Management
        </h5>
      </div>
      <div className="card-body">
        <form onSubmit={handleSearch} className="mb-3">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Enter National ID to find user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {error && <div className="alert alert-danger">{error}</div>}
        {actionMessage && (
          <div className="alert alert-success">{actionMessage}</div>
        )}

        {user && (
          <div className="card">
            <div className="card-body">
              <h6 className="card-title">
                {user.first_name} {user.surname}
              </h6>
              <p className="card-text small text-muted">
                ID: {user.id} | National ID: {user.national_id} | Department:{" "}
                {user.department || "N/A"}
              </p>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-warning"
                  onClick={handleResetPassword}
                  disabled={loading}
                >
                  <i className="bi bi-key-fill me-1"></i> Reset Password
                </button>
                <button
                  className="btn btn-info"
                  onClick={handleUnlockAccount}
                  disabled={loading}
                >
                  <i className="bi bi-unlock-fill me-1"></i> Unlock Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserAccountManagement;
