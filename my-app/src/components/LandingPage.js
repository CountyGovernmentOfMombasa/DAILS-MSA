import React, { useEffect, useRef, useState } from "react";
import { useUser } from "../context/UserContext";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Alert,
  Spinner,
  Table,
  Badge,
  Modal,
  Toast,
  ToastContainer,
} from "react-bootstrap";
import useAdminSession from "../hooks/useAdminSession";
import "./LandingPage.css"; // Assuming this file exists and is correct
import {
  getDeclarations,
  getProgress,
  deleteProgress,
  adminFetch,
} from "../api";
import { normalizeDeclarationType } from "../util/normalizeDeclarationType"; // ensure resumed progress carries canonical declaration type
// Department logic now mirrors UserForm: user selects sub_department, department auto-derived (read-only)
import {
  SUB_DEPARTMENTS,
  SUB_DEPARTMENT_PARENT,
} from "../constants/departments";
// PDF now generated server-side; client just downloads
// import { appendDeclarationIdToPath } from '../utilis/editContext'; // no longer needed after draft removal
import {
  loadProgress,
  stepToPath,
  deriveUserKey,
  clearProgress,
  saveProgress,
  isProgressSuppressed,
} from "../utilis/persistProgress";

const LandingPage = () => {
  const { profile, setProfile } = useUser();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [declarations, setDeclarations] = useState([]);
  const [declarationsLoading, setDeclarationsLoading] = useState(true);
  const [declarationsError, setDeclarationsError] = useState("");
  // Local persisted progress (client side replacement for drafts)
  const [progress, setProgress] = useState(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [resumeToast, setResumeToast] = useState({ show: false, step: "" });
  const [pdfToast, setPdfToast] = useState({ show: false, message: "" });
  // Pagination state for declarations
  const [declPage, setDeclPage] = useState(1);
  const [declPageSize, setDeclPageSize] = useState(10);
  // Declaration detail modal state
  const [showDeclModal, setShowDeclModal] = useState(false);
  const [declModalLoading, setDeclModalLoading] = useState(false);
  const [declModalError, setDeclModalError] = useState("");
  const [selectedDecl, setSelectedDecl] = useState(null);
  const [adminFallbackUsed, setAdminFallbackUsed] = useState(false);
  const [sampleDesignations, setSampleDesignations] = useState([]);
  const navigate = useNavigate();
  const profileCardRef = useRef(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [missingProfile, setMissingProfile] = useState([]);
  const {
    hasAdminAccess,
    adminToken,
    roleAbbrev,
    elevating,
    error: elevationError,
    elevateAndGo,
  } = useAdminSession();

  // --- Profile gating definitions placed early to satisfy hook ordering/lint ---
  const REQUIRED_PROFILE_FIELDS = React.useMemo(
    () => [
      { key: "surname", label: "Surname" },
      { key: "first_name", label: "First Name" },
      { key: "marital_status", label: "Marital Status" },
      { key: "designation", label: "Designation" },
      { key: "sub_department", label: "Sub Department" },
      { key: "department", label: "Department" },
      { key: "email", label: "Email" },
      { key: "phone_number", label: "Phone Number" },
      { key: "other_names", label: "Other Names" },
      { key: "birthdate", label: "Date of Birth" },
      { key: "place_of_birth", label: "Place of Birth" },
      { key: "physical_address", label: "Physical Address" },
      { key: "payroll_number", label: "Payroll Number" },
      { key: "nature_of_employment", label: "Nature of Employment" },
      { key: "national_id", label: "National ID" },
    ],
    []
  );

  const computeMissingProfileFields = React.useCallback(
    (p) => {
      const trim = (x) => (typeof x === "string" ? x.trim() : x);
      return REQUIRED_PROFILE_FIELDS.filter(
        ({ key }) => !p || !trim(p[key])
      ).map((f) => f.label);
    },
    [REQUIRED_PROFILE_FIELDS]
  );

  // Fetch sample designations when edit mode is activated
  useEffect(() => {
    if (editMode && sampleDesignations.length === 0) {
      const fetchDesignations = async () => {
        try {
          const token = localStorage.getItem("token");
          const res = await fetch("/api/admin/users/designations/distinct", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setSampleDesignations(data.designations || []);
          }
        } catch (e) {
          /* Silently fail */
        }
      };
      fetchDesignations();
    }
  }, [editMode, sampleDesignations.length]);

  const handleExportPDF = async (declaration) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/declarations/${declaration.id}/download-pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error("Failed to download PDF");
      // Show password instruction toast if provided by server
      const instructionHeader = res.headers.get("X-PDF-Password-Instruction");
      if (instructionHeader) {
        setPdfToast({ show: true, message: instructionHeader });
      } else {
        setPdfToast({
          show: true,
          message:
            "The password for the attached PDF is Your National ID number.",
        });
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `declaration_${declaration.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Could not export PDF. Please try again.");
    }
  };

  // Map backend 'pending' to user-facing 'Submitted'
  const formatStatus = (s) => {
    if (!s) return "N/A";
    if (s === "pending") return "Submitted";
    if (s === "rejected") return "Requesting Clarification";
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  // Fetch declarations
  useEffect(() => {
    let cancelled = false;
    const fetchDeclarations = async (force = false) => {
      const lastFetch = window.__declListLastFetch || 0;
      const now = Date.now();
      if (!force && now - lastFetch < 10000 && window.__declListCached) {
        setDeclarations(window.__declListCached);
        setDeclarationsLoading(false);
        return;
      }
      setDeclarationsLoading(true);
      setDeclarationsError("");
      setAdminFallbackUsed(false);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token");
        const res = await getDeclarations(`Bearer ${token}`);
        let list = (res.data && res.data.declarations) || [];
        // If nothing returned, and we have admin access with an active admin token, try admin index as fallback (match by National ID)
        try {
          if (
            Array.isArray(list) &&
            list.length === 0 &&
            hasAdminAccess &&
            profile &&
            profile.national_id
          ) {
            // Auto-elevate if needed and fetch admin declarations, then filter by National ID
            const resp = await adminFetch("/api/admin/declarations", {
              method: "GET",
            });
            if (resp && resp.ok) {
              const data = await resp.json().catch(() => ({}));
              const all = (data && data.data) || [];
              const matched = all.filter(
                (d) => String(d.national_id) === String(profile.national_id)
              );
              if (matched.length > 0) {
                list = matched;
                setAdminFallbackUsed(true);
              }
            }
          }
        } catch (_) {
          // ignore admin fallback failures silently
        }
        if (!cancelled) {
          setDeclarations(list);
          window.__declListCached = list;
          window.__declListLastFetch = Date.now();
          // Reset page if out of range after new fetch
          const totalPages = Math.max(1, Math.ceil(list.length / declPageSize));
          if (declPage > totalPages) setDeclPage(1);
        }
      } catch (e) {
        if (!cancelled) setDeclarationsError("Could not load declarations.");
      } finally {
        if (!cancelled) setDeclarationsLoading(false);
      }
    };
    fetchDeclarations();
    // Expose retry function
    window.__retryFetchDeclarations = () => fetchDeclarations(true);
    return () => {
      cancelled = true;
    };
  }, [declPageSize, declPage, hasAdminAccess, adminToken, profile]);

  const handleRetryDeclarations = () => {
    if (typeof window.__retryFetchDeclarations === "function") {
      window.__retryFetchDeclarations();
    }
  };

  // Load local progress (if any) once
  useEffect(() => {
    if (!profile) return;
    const key = deriveUserKey(profile);
    const local = loadProgress(key);
    if (local) {
      setProgress(local);
    } else {
      // Attempt server fetch
      const token = localStorage.getItem("token");
      if (!isProgressSuppressed(key)) {
        getProgress(key, token)
          .then((data) => {
            if (data && data.success && data.progress) {
              saveProgress(data.progress, key);
              setProgress(loadProgress(key));
            }
          })
          .catch(() => {
            /* ignore */
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, computeMissingProfileFields]);
  // Profile now comes from UserContext; when it appears, initialize form
  useEffect(() => {
    if (!profile) return;
    const normalizedBirthdate =
      profile.birthdate && profile.birthdate !== "0000-00-00"
        ? profile.birthdate
        : "";
    setForm({
      ...profile,
      birthdate: normalizedBirthdate,
      nature_of_employment: profile.nature_of_employment || "",
      sub_department: profile.sub_department || "",
    });
    setLoading(false);
    // After loading profile, pre-compute missing required fields for soft validation
    const missing = computeMissingProfileFields(profile || {});
    setMissingProfile(missing);
    if (missing.length) {
      // Force edit mode so user can immediately correct missing fields
      setEditMode(true);
      // Scroll to profile section to draw attention
      try {
        profileCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } catch (_) {}
    }
  }, [profile, computeMissingProfileFields]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "sub_department") {
      const parent = SUB_DEPARTMENT_PARENT[value] || "";
      setForm((prev) => ({
        ...prev,
        sub_department: value,
        department: parent,
      }));
      return;
    }
    // Department is auto-derived and read-only; any attempt to change it manually clears sub_department if mismatch (defensive)
    if (name === "department") {
      setForm((prev) => {
        if (
          prev.sub_department &&
          SUB_DEPARTMENT_PARENT[prev.sub_department] !== value
        ) {
          return { ...prev, department: value, sub_department: "" };
        }
        return { ...prev, department: value };
      });
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    // Client-side validation: if department selected, sub_department required
    if (form.department && !form.sub_department) {
      setSaving(false);
      setError("Please select a sub department for the chosen department.");
      return;
    }
    // Client-side validation: designation required
    if (!form.designation || !String(form.designation).trim()) {
      setSaving(false);
      setError("Designation is required.");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      setSuccess("Profile updated successfully.");
      setEditMode(false);
      // Merge new form values into context profile if available
      setProfile((prev) => ({
        ...(prev || {}),
        ...form,
        birthdate:
          form.birthdate && form.birthdate !== "0000-00-00"
            ? form.birthdate
            : "",
      }));
    } catch (e) {
      setError("Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdminAccess = () => {
    navigate("/admin-access");
  };

  // --- Profile gating logic ---
  // (moved REQUIRED_PROFILE_FIELDS & computeMissingProfileFields above)

  const handleStartDeclaration = () => {
    const base = form && Object.keys(form).length ? form : profile;
    const missing = computeMissingProfileFields(base || {});
    if (missing.length) {
      setMissingProfile(missing);
      setShowProfileModal(true);
      try {
        profileCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } catch (_) {}
      return;
    }
    navigate("/select-declaration-type", { state: { profile: base } });
  };

  // Edit Declaration Handler
  const handleEditDeclaration = (declaration) => {
    navigate(`/edit-selection/${declaration.id}`);
  };
  // View Declaration Handler (open modal)
  const handleViewDeclaration = async (declaration) => {
    setSelectedDecl(null);
    setDeclModalError("");
    setShowDeclModal(true);
    // Cache check
    if (window.__declDetailCache && window.__declDetailCache[declaration.id]) {
      setSelectedDecl(window.__declDetailCache[declaration.id]);
      return;
    }
    setDeclModalLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/declarations/${declaration.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch declaration details");
      const data = await res.json();
      if (!data.success) throw new Error("Malformed response");
      const decl = data.declaration;
      window.__declDetailCache = window.__declDetailCache || {};
      window.__declDetailCache[declaration.id] = decl;
      setSelectedDecl(decl);
    } catch (e) {
      setDeclModalError(e.message || "Could not load declaration details");
    } finally {
      setDeclModalLoading(false);
    }
  };

  // Helpers for declaration modal
  const safeParseArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const renderFinSection = (label, arr) => {
    const filtered = (arr || []).filter(
      (r) => (r.description || "").trim() || r.value
    );
    if (!filtered.length)
      return (
        <div className="mb-1">
          <strong>{label}:</strong> <span className="text-muted">None</span>
        </div>
      );
    return (
      <div className="mb-1">
        <strong>{label}:</strong>
        <ul className="small mb-0 mt-1">
          {filtered.map((r, i) => (
            <li key={i}>
              {r.description || r.type || "—"}
              {r.value !== undefined && r.value !== "" && (
                <span
                  className={
                    label === "Liabilities"
                      ? "text-danger ms-1"
                      : label === "Assets"
                      ? "text-primary ms-1"
                      : "text-success ms-1"
                  }
                >
                  Ksh {parseFloat(r.value || 0).toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Resume local progress
  const handleResumeProgress = () => {
    if (!progress) return;
    const path = stepToPath(progress.lastStep || "user");
    // Attempt to recover a canonical declaration type from saved snapshot
    const rawType =
      progress.stateSnapshot?.userData?.declaration_type ||
      progress.stateSnapshot?.userData?.declarationType ||
      "";
    const canonicalType = normalizeDeclarationType(rawType);
    const mergedState = { ...progress.stateSnapshot };
    // Inject declarationType (used by downstream pages) and keep userData in sync
    mergedState.declarationType = canonicalType;
    if (mergedState.userData) {
      mergedState.userData = {
        ...mergedState.userData,
        declaration_type: canonicalType,
      };
    }
    setResumeToast({ show: true, step: progress.lastStep || "user" });
    navigate(path, { state: mergedState });
  };
  const handleRestoreFromServer = async () => {
    if (!profile) return;
    const key = deriveUserKey(profile);
    const token = localStorage.getItem("token");
    try {
      const data = await getProgress(key, token);
      if (data && data.success && data.progress) {
        saveProgress(data.progress, key);
        const refreshed = loadProgress(key);
        setProgress(refreshed);
        setResumeToast({ show: true, step: refreshed.lastStep || "user" });
      }
    } catch (_) {
      /* ignore */
    }
  };
  const handleDiscardProgress = () => {
    if (!profile) return;
    const key = deriveUserKey(profile);
    clearProgress(key);
    setProgress(null);
    setShowDiscardModal(false);
  };

  // Human friendly time like `5 minutes ago`
  const timeAgo = (dateStr) => {
    if (!dateStr) return "-";
    const then = new Date(dateStr);
    const now = new Date();
    const diff = Math.max(0, now - then);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    // Otherwise show date
    return then.toLocaleString();
  };

  // Helper to render the combined table for drafts + declarations
  const renderPrevTable = () => {
    const total = Array.isArray(declarations) ? declarations.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / declPageSize));
    const currentPage = Math.min(declPage, totalPages);
    const startIdx = (currentPage - 1) * declPageSize;
    const pageSlice = (Array.isArray(declarations) ? declarations : []).slice(
      startIdx,
      startIdx + declPageSize
    );
    const from = total === 0 ? 0 : startIdx + 1;
    const to = startIdx + pageSlice.length;
    return (
      <>
        <div className="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">
          <div className="small text-muted">
            Showing {from}-{to} of {total}
          </div>
          <div className="d-flex align-items-center gap-2">
            <Form.Select
              size="sm"
              style={{ width: "auto" }}
              value={declPageSize}
              onChange={(e) => {
                setDeclPageSize(parseInt(e.target.value, 10));
                setDeclPage(1);
              }}
              aria-label="Select page size"
            >
              {[5, 10, 20, 50].map((sz) => (
                <option key={sz} value={sz}>
                  {sz}/page
                </option>
              ))}
            </Form.Select>
            <div
              className="btn-group"
              role="group"
              aria-label="Pagination controls"
            >
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={currentPage === 1}
                onClick={() => setDeclPage((p) => Math.max(1, p - 1))}
              >
                &laquo;
              </Button>
              <Button size="sm" variant="outline-secondary" disabled>
                {currentPage} / {totalPages}
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setDeclPage((p) => Math.min(totalPages, p + 1))}
              >
                &raquo;
              </Button>
            </div>
          </div>
        </div>
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>#</th>
              <th>Declaration Type</th>
              <th>Period</th>
              <th>Date Submitted</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pageSlice.map((decl, localIdx) => {
              return (
                <tr key={decl.id}>
                  <td>{startIdx + localIdx + 1}</td>
                  <td>{decl.declaration_type || "N/A"}</td>
                  <td>
                    {decl.period_start_date && decl.period_end_date
                      ? `${new Date(
                          decl.period_start_date
                        ).toLocaleDateString()} to ${new Date(
                          decl.period_end_date
                        ).toLocaleDateString()}`
                      : "N/A"}
                  </td>
                  <td>
                    {decl.declaration_date
                      ? new Date(decl.declaration_date).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td>
                    <Badge
                      bg={
                        decl.status === "approved"
                          ? "success"
                          : decl.status === "pending"
                          ? "warning"
                          : decl.status === "rejected"
                          ? "danger"
                          : "secondary"
                      }
                    >
                      {formatStatus(decl.status)}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleViewDeclaration(decl)}
                    >
                      View
                    </Button>{" "}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleExportPDF(decl)}
                    >
                      Export to PDF
                    </Button>{" "}
                    {(decl.status === "pending" ||
                      decl.status === "rejected" ||
                      (decl.status === "approved" &&
                        (decl.user_edit_count || 0) < 1)) && (
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={() => handleEditDeclaration(decl)}
                        disabled={
                          decl.user_edit_count >= 1 &&
                          decl.status === "approved"
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!pageSlice.length && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  No declarations on this page.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 32,
          zIndex: 10,
          display: "flex",
          gap: "0.5rem",
        }}
      >
        {hasAdminAccess &&
          (adminToken ? (
            <Button
              variant="outline-primary"
              onClick={() => navigate("/admin")}
              disabled={elevating}
            >
              Admin Dashboard{" "}
              {roleAbbrev && (
                <span
                  className="badge bg-primary ms-2"
                  data-testid="role-badge"
                >
                  {roleAbbrev}
                </span>
              )}
            </Button>
          ) : (
            <Button
              variant="outline-secondary"
              onClick={elevateAndGo}
              disabled={elevating}
              data-testid="admin-access-button"
            >
              {elevating ? "Requesting..." : "Admin Access"}
            </Button>
          ))}
      </div>
      <Container className="py-5">
        <div className="text-center mb-5">
          <img
            src="/logo192.png"
            alt="County Government of Mombasa Logo"
            className="mb-3"
            style={{
              width: "120px",
              height: "120px",
              objectFit: "contain",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.1))",
            }}
          />
          <h1
            className="display-4 fw-bold text-dark mb-4"
            style={{
              background:
                "linear-gradient(45deg, var(--primary-blue), var(--secondary-green))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            County Government of Mombasa Employee Portal
          </h1>
          <p className="lead text-muted">
            Please select the form you'd like to complete or access external
            services
          </p>
          {elevationError && (
            <Alert variant="danger" className="mt-3 py-2">
              {elevationError}
            </Alert>
          )}
        </div>
        {/* Profile Section */}
        <Card className="mb-5 shadow border-0" ref={profileCardRef}>
          <Card.Body>
            <h3 className="fw-bold mb-4 text-primary">My Profile</h3>
            <Alert variant="warning" className="mb-4">
              Please review your profile and update any information that is not
              accurate. Click <strong>Edit Profile</strong> to make changes,
              then select <strong>Save</strong>.
            </Alert>
            {loading ? (
              <Spinner animation="border" />
            ) : (
              <>
                {missingProfile.length > 0 && (
                  <Alert variant="danger" className="mb-4">
                    <strong>Profile Incomplete:</strong> Please fill the
                    following before starting a declaration:
                    <ul className="mb-0 mt-2">
                      {missingProfile.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
                <Form onSubmit={handleSave}>
                  <Row>
                    <Alert variant="info" className="w-100">
                      {" "}
                      Use your legal names as per National identification.{" "}
                    </Alert>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-surname">
                          Surname
                        </Form.Label>
                        <Form.Control
                          id="profile-surname"
                          name="surname"
                          value={form.surname || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode && !String(form.surname || "").trim() && (
                          <div className="form-text text-danger">Required.</div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-first-name">
                          First Name
                        </Form.Label>
                        <Form.Control
                          id="profile-first-name"
                          name="first_name"
                          value={form.first_name || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode && !String(form.first_name || "").trim() && (
                          <div className="form-text text-danger">Required.</div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-other-names">
                          Other Names
                        </Form.Label>
                        <Form.Control
                          id="profile-other-names"
                          name="other_names"
                          value={form.other_names || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode && !String(form.other_names || "").trim() && (
                          <div className="form-text text-danger">Required.</div>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Alert variant="info" className="w-100">
                      {" "}
                      Ensure your date and place of birth match your National
                      ID.{" "}
                    </Alert>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-birthdate">
                          Date of Birth
                        </Form.Label>
                        <Form.Control
                          id="profile-birthdate"
                          name="birthdate"
                          type="date"
                          value={
                            form.birthdate ? form.birthdate.slice(0, 10) : ""
                          }
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode && !String(form.birthdate || "").trim() && (
                          <div className="form-text text-danger">Required.</div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-place-of-birth">
                          Place of Birth
                        </Form.Label>
                        <Form.Control
                          id="profile-place-of-birth"
                          name="place_of_birth"
                          value={form.place_of_birth || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode &&
                          !String(form.place_of_birth || "").trim() && (
                            <div className="form-text text-danger">
                              Required.
                            </div>
                          )}
                        {editMode && sampleDesignations.length > 0 && (
                          <Alert variant="light" className="mt-2 p-2 small">
                            <i className="fas fa-info-circle me-1"></i>
                            e.g., {sampleDesignations.slice(0, 5).join(", ")}
                            {sampleDesignations.length > 5 ? ", etc." : "."}
                          </Alert>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-marital-status">
                          Marital Status
                        </Form.Label>
                        <Form.Select
                          id="profile-marital-status"
                          name="marital_status"
                          value={form.marital_status || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        >
                          <option value="">Select status</option>
                          <option value="single">Single</option>
                          <option value="married">Married</option>
                          <option value="separated">Separated</option>
                          <option value="divorced">Divorced</option>
                          <option value="widowed">Widowed</option>
                        </Form.Select>
                        {editMode &&
                          !String(form.marital_status || "").trim() && (
                            <div className="form-text text-danger">
                              Required.
                            </div>
                          )}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Alert variant="info" className="w-100">
                      {" "}
                      Provide your exact current residential locations.{" "}
                    </Alert>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-postal-address">
                          Postal Address
                        </Form.Label>
                        <Form.Control
                          id="profile-postal-address"
                          name="postal_address"
                          value={form.postal_address || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-physical-address">
                          Physical Address
                        </Form.Label>
                        <Form.Control
                          id="profile-physical-address"
                          name="physical_address"
                          value={form.physical_address || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode &&
                          !String(form.physical_address || "").trim() && (
                            <div className="form-text text-danger">
                              Required.
                            </div>
                          )}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Alert variant="info" className="w-100">
                      {" "}
                      Kindly change the email to the you currently actively use.{" "}
                    </Alert>
                    <Col md={3}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-email">Email</Form.Label>
                        <Form.Control
                          id="profile-email"
                          name="email"
                          value={form.email || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode && !String(form.email || "").trim() && (
                          <div className="form-text text-danger">Required.</div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-phone-number">
                          Phone Number
                        </Form.Label>
                        <Form.Control
                          id="profile-phone-number"
                          name="phone_number"
                          value={form.phone_number || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode &&
                          !String(form.phone_number || "").trim() && (
                            <div className="form-text text-danger">
                              Required.
                            </div>
                          )}
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-national-id">
                          National ID
                        </Form.Label>
                        <Form.Control
                          id="profile-national-id"
                          name="national_id"
                          value={form.national_id || ""}
                          onChange={handleChange}
                          disabled
                          required
                        />
                        {!String(form.national_id || "").trim() && (
                          <div className="form-text text-danger">
                            Required (contact admin if missing).
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-payroll-number">
                          Payroll Number
                        </Form.Label>
                        <Form.Control
                          id="profile-payroll-number"
                          name="payroll_number"
                          value={form.payroll_number || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        />
                        {editMode &&
                          !String(form.payroll_number || "").trim() && (
                            <div className="form-text text-danger">
                              Required.
                            </div>
                          )}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-designation">
                          Designation
                        </Form.Label>
                        <Form.Control
                          id="profile-designation"
                          name="designation"
                          value={form.designation || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required={editMode}
                        />
                        {editMode && (
                          <Form.Text muted>
                            Fill the designation as per your appointment letter.
                          </Form.Text>
                        )}
                        {editMode && !(form.designation || "").trim() && (
                          <div className="form-text text-danger">
                            Designation is required.
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-sub-department">
                          Sub Department
                        </Form.Label>
                        <Form.Select
                          id="profile-sub-department"
                          name="sub_department"
                          value={form.sub_department || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required={editMode}
                        >
                          <option value="">Select sub department</option>
                          {SUB_DEPARTMENTS.map((sd) => (
                            <option key={sd} value={sd}>
                              {sd}
                            </option>
                          ))}
                        </Form.Select>
                        {editMode && !form.sub_department && (
                          <div className="form-text text-danger">
                            Sub department is required.
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-department">
                          Department (auto)
                        </Form.Label>
                        <Form.Control
                          id="profile-department"
                          name="department"
                          type="text"
                          value={form.department || ""}
                          readOnly
                          placeholder="Derived from Sub Department"
                          required
                        />
                        {!String(form.department || "").trim() && (
                          <div className="form-text text-danger">
                            Required (select Sub Department).
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="profile-nature-of-employment">
                          Nature of Employment
                        </Form.Label>
                        <Form.Select
                          id="profile-nature-of-employment"
                          name="nature_of_employment"
                          value={form.nature_of_employment || ""}
                          onChange={handleChange}
                          disabled={!editMode}
                          required
                        >
                          <option value="">Select employment type</option>
                          <option value="Permanent">Permanent</option>
                          <option value="Contract">Contract</option>
                          <option value="Temporary">Temporary</option>
                        </Form.Select>
                        {editMode &&
                          !String(form.nature_of_employment || "").trim() && (
                            <div className="form-text text-danger">
                              Required.
                            </div>
                          )}
                      </Form.Group>
                    </Col>
                  </Row>
                  {error && <Alert variant="danger">{error}</Alert>}
                  {success && <Alert variant="success">{success}</Alert>}
                  {editMode && (
                    <div className="d-flex gap-2">
                      <Button type="submit" disabled={saving}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditMode(false);
                          setForm({
                            ...profile,
                            birthdate:
                              profile && profile.birthdate
                                ? profile.birthdate
                                : "",
                            nature_of_employment:
                              profile && profile.nature_of_employment
                                ? profile.nature_of_employment
                                : "",
                            sub_department:
                              profile && profile.sub_department
                                ? profile.sub_department
                                : "",
                          });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </Form>
                {!editMode && (
                  <div className="d-flex gap-2 mt-2">
                    <Button type="button" onClick={() => setEditMode(true)}>
                      Edit Profile
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card.Body>
        </Card>

        {/* Declarations Section */}
        <Card className="mb-5 shadow border-0">
          <Card.Body>
            <h3 className="fw-bold mb-4 text-primary">
              My Previous Declarations
            </h3>
            {declarationsLoading ? (
              <Spinner animation="border" />
            ) : declarationsError ? (
              <>
                {declarationsError && (
                  <Alert
                    variant="danger"
                    className="d-flex justify-content-between align-items-center"
                  >
                    {declarationsError}
                    <Button
                      size="sm"
                      variant="outline-light"
                      onClick={handleRetryDeclarations}
                    >
                      Retry
                    </Button>
                  </Alert>
                )}
                {adminFallbackUsed && (
                  <Alert variant="info" className="py-2">
                    Showing declarations matched by your National ID via admin
                    index.
                  </Alert>
                )}
                {declarations.length === 0 ? (
                  <Alert variant="info">No previous declarations found.</Alert>
                ) : (
                  renderPrevTable()
                )}
              </>
            ) : declarations.length === 0 ? (
              <Alert variant="info">No previous declarations found.</Alert>
            ) : (
              renderPrevTable()
            )}
            {progress && (
              <div className="mt-3">
                <Alert
                  variant="info"
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    You have an in-progress declaration last updated{" "}
                    {timeAgo(progress.updatedAt)} at step:{" "}
                    <strong>{progress.lastStep}</strong>
                    <div className="small mt-2">
                      {(() => {
                        const snap = progress.stateSnapshot || {};
                        const totalSteps = 4;
                        let completed = 0;
                        if (snap.userData) completed++;
                        if (snap.spouses || snap.children) completed++;
                        if (snap.allFinancialData) completed++;
                        if (snap.review) completed++;
                        const pct = Math.round((completed / totalSteps) * 100);
                        return (
                          <span>
                            Progress: {pct}% ({completed}/{totalSteps} steps)
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleResumeProgress}
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={async () => {
                        setShowDiscardModal(true);
                        if (typeof deleteProgress === "function") {
                          try {
                            if (profile) {
                              const key = deriveUserKey(profile);
                              const token = localStorage.getItem("token");
                              await deleteProgress(key, token);
                            }
                          } catch (e) {}
                        }
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={handleRestoreFromServer}
                    >
                      Restore
                    </Button>
                  </div>
                </Alert>
              </div>
            )}
          </Card.Body>
        </Card>
        <Modal
          show={showDiscardModal}
          onHide={() => setShowDiscardModal(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Discard In-Progress Declaration</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            This will permanently remove your locally saved progress for the
            current declaration. Submitted declarations are unaffected. Do you
            want to continue?
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowDiscardModal(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDiscardProgress}>
              Discard
            </Button>
          </Modal.Footer>
        </Modal>
        {/* Profile completion required modal */}
        <Modal
          show={showProfileModal}
          onHide={() => setShowProfileModal(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Complete Your Profile</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-2">
              Please complete the following before starting your declaration:
            </p>
            {missingProfile.length === 0 ? (
              <p className="text-success mb-0">
                All required fields are filled.
              </p>
            ) : (
              <ul className="mb-0">
                {missingProfile.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowProfileModal(false)}
            >
              Close
            </Button>
            {missingProfile.length > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  setShowProfileModal(false);
                  setEditMode(true);
                  try {
                    profileCardRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  } catch (_) {}
                }}
              >
                Edit Profile Now
              </Button>
            )}
          </Modal.Footer>
        </Modal>
        <ToastContainer position="bottom-end" className="p-3">
          <Toast
            bg="info"
            onClose={() => setResumeToast({ show: false, step: "" })}
            show={resumeToast.show}
            delay={3000}
            autohide
          >
            <Toast.Header closeButton={true}>
              <strong className="me-auto">Resume</strong>
              <small>Now</small>
            </Toast.Header>
            <Toast.Body className="text-white">
              Resumed declaration at step: <strong>{resumeToast.step}</strong>
            </Toast.Body>
          </Toast>
          <Toast
            bg="dark"
            onClose={() => setPdfToast({ show: false, message: "" })}
            show={pdfToast.show}
            delay={5000}
            autohide
          >
            <Toast.Header closeButton={true}>
              <strong className="me-auto">PDF Password</strong>
              <small>Now</small>
            </Toast.Header>
            <Toast.Body className="text-white">{pdfToast.message}</Toast.Body>
          </Toast>
        </ToastContainer>

        <Row className="justify-content-center">
          <Col lg={3} md={6} className="mb-4">
            <div
              className="text-decoration-none"
              style={{ cursor: "pointer" }}
              onClick={handleStartDeclaration}
            >
              <Card
                className="h-100 shadow-sm border-primary border-2 hover-card"
                style={{ transition: "all 0.3s ease", cursor: "pointer" }}
              >
                <Card.Body className="text-center p-4">
                  <div className="mb-4">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                      style={{
                        width: "80px",
                        height: "80px",
                        background:
                          "linear-gradient(45deg, var(--primary-blue), #0056b3)",
                      }}
                    >
                      <i
                        className="fas fa-file-alt text-white"
                        style={{ fontSize: "2rem" }}
                      ></i>
                    </div>
                  </div>
                  <h4 className="card-title text-primary fw-bold mb-3">
                    Declaration of Income, Assets and Liabilities Form
                  </h4>
                  <p className="card-text text-muted">
                    Complete your DIALs disclosure
                  </p>
                </Card.Body>
              </Card>
            </div>
          </Col>

          <Col lg={3} md={6} className="mb-4">
            <a
              href="https://mcpsbsurvey.mombasa.go.ke/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-decoration-none"
            >
              <Card
                className="h-100 shadow-sm border-info border-2 hover-card"
                style={{ transition: "all 0.3s ease", cursor: "pointer" }}
              >
                <Card.Body className="text-center p-4">
                  <div className="mb-4">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                      style={{
                        width: "80px",
                        height: "80px",
                        background: "linear-gradient(45deg, #17a2b8, #138496)",
                      }}
                    >
                      <i
                        className="fas fa-poll text-white"
                        style={{ fontSize: "2rem" }}
                      ></i>
                    </div>
                  </div>
                  <h4 className="card-title text-info fw-bold mb-3">
                    MCPSB Survey
                  </h4>
                  <p className="card-text text-muted">
                    Access the official MCPSB survey portal
                  </p>
                  <small className="text-muted">
                    <i className="fas fa-external-link-alt me-1"></i>
                    External Link
                  </small>
                </Card.Body>
              </Card>
            </a>
          </Col>

          <Col lg={3} md={6} className="mb-4">
            <a
              href="https://ictsupport.mombasa.go.ke/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-decoration-none"
            >
              <Card
                className="h-100 shadow-sm border-warning border-2 hover-card"
                style={{ transition: "all 0.3s ease", cursor: "pointer" }}
              >
                <Card.Body className="text-center p-4">
                  <div className="mb-4">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                      style={{
                        width: "80px",
                        height: "80px",
                        background: "linear-gradient(45deg, #ffc107, #e0a800)",
                      }}
                    >
                      <i
                        className="fas fa-headset text-white"
                        style={{ fontSize: "2rem" }}
                      ></i>
                    </div>
                  </div>
                  <h4 className="card-title text-warning fw-bold mb-3">
                    ICT Helpdesk
                  </h4>
                  <p className="card-text text-muted">
                    Access Mombasa County ICT helpdesk services
                  </p>
                  <small className="text-muted">
                    <i className="fas fa-external-link-alt me-1"></i>
                    External Link
                  </small>
                </Card.Body>
              </Card>
            </a>
          </Col>

          <Col lg={3} md={6} className="mb-4">
            <div
              //className="text-decoration-none"
              className="text-decoration-none h-100"
              style={{ cursor: "pointer" }}
              onClick={handleAdminAccess}
            >
              <Card
                className="h-100 shadow-sm border-success border-2 hover-card"
                style={{ transition: "all 0.3s ease", cursor: "pointer" }}
              >
                <Card.Body className="text-center p-4">
                  <div className="mb-4">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                      style={{
                        width: "80px",
                        height: "80px",
                        background:
                          "linear-gradient(45deg, var(--secondary-green), #1e7e34)",
                      }}
                    >
                      <i
                        className="fas fa-users-cog text-white"
                        style={{ fontSize: "2rem" }}
                      ></i>
                    </div>
                  </div>
                  <h4 className="card-title text-success fw-bold mb-3">
                    Admin Access
                  </h4>
                  <p className="card-text text-muted">
                    View and manage declarations
                  </p>
                </Card.Body>
              </Card>
            </div>
          </Col>
        </Row>

        {/* Optional: Add a footer section */}
        <div className="text-center mt-5 pt-4 border-top">
          <p className="text-muted mb-0">
            <i className="fas fa-shield-alt me-2"></i>
            Secure Employee Portal - Mombasa County
          </p>
        </div>

        {/* Declaration Detail Modal */}
        <Modal
          size="xl"
          show={showDeclModal}
          onHide={() => {
            setShowDeclModal(false);
            setSelectedDecl(null);
          }}
          backdrop="static"
          centered
          scrollable
        >
          <Modal.Header closeButton>
            <Modal.Title>Declaration Details</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {declModalLoading && (
              <div className="d-flex justify-content-center py-5">
                <Spinner animation="border" />
              </div>
            )}
            {declModalError && !declModalLoading && (
              <Alert variant="danger" className="mb-0">
                {declModalError}
              </Alert>
            )}
            {selectedDecl && !declModalLoading && !declModalError && (
              <div>
                <h5 className="mb-3">Summary</h5>
                <Row className="mb-4 small g-3">
                  <Col md={3}>
                    <strong>ID:</strong> {selectedDecl.id}
                  </Col>
                  <Col md={3}>
                    <strong>Type:</strong> {selectedDecl.declaration_type}
                  </Col>
                  <Col md={3}>
                    <strong>Status:</strong>{" "}
                    <Badge
                      bg={
                        selectedDecl.status === "approved"
                          ? "success"
                          : selectedDecl.status === "pending"
                          ? "warning"
                          : selectedDecl.status === "rejected"
                          ? "danger"
                          : "secondary"
                      }
                    >
                      {formatStatus(selectedDecl.status)}
                    </Badge>
                  </Col>
                  <Col md={3}>
                    <strong>Decl Date:</strong>{" "}
                    {selectedDecl.declaration_date || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Period Start:</strong>{" "}
                    {selectedDecl.period_start_date
                      ? new Date(
                          selectedDecl.period_start_date
                        ).toLocaleDateString()
                      : "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Period End:</strong>{" "}
                    {selectedDecl.period_end_date
                      ? new Date(
                          selectedDecl.period_end_date
                        ).toLocaleDateString()
                      : "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Updated:</strong>{" "}
                    {selectedDecl.updated_at
                      ? new Date(selectedDecl.updated_at).toLocaleString()
                      : "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Submitted:</strong>{" "}
                    {selectedDecl.submitted_at || "—"}
                  </Col>
                </Row>
                <h5 className="mb-2">Personal</h5>
                <Row className="small mb-4 g-3">
                  <Col md={3}>
                    <strong>Name:</strong>{" "}
                    {(selectedDecl.first_name || "") +
                      " " +
                      (selectedDecl.other_names || "") +
                      " " +
                      (selectedDecl.surname || "")}
                  </Col>
                  <Col md={3}>
                    <strong>Marital Status:</strong>{" "}
                    {selectedDecl.marital_status || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Email:</strong> {selectedDecl.email || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Payroll #:</strong>{" "}
                    {selectedDecl.payroll_number || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Department:</strong>{" "}
                    {selectedDecl.department || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Birthdate:</strong> {selectedDecl.birthdate || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Place of Birth:</strong>{" "}
                    {selectedDecl.place_of_birth || "—"}
                  </Col>
                  <Col md={3}>
                    <strong>Nature of Employment:</strong>{" "}
                    {selectedDecl.nature_of_employment || "—"}
                  </Col>
                </Row>
                <h5 className="mb-2">
                  Spouses ({(selectedDecl.spouses || []).length})
                </h5>
                {!selectedDecl.spouses || !selectedDecl.spouses.length ? (
                  <p className="text-muted small">None</p>
                ) : (
                  <Table size="sm" bordered responsive className="mb-4">
                    <thead>
                      <tr className="small">
                        <th>Name</th>
                        <th>Income Items</th>
                        <th>Assets</th>
                        <th>Liabilities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDecl.spouses.map((s) => {
                        const income = safeParseArray(s.biennial_income);
                        const assets = safeParseArray(s.assets);
                        const liabilities = safeParseArray(s.liabilities);
                        return (
                          <tr key={s.id} className="small">
                            <td>
                              {s.full_name ||
                                [s.first_name, s.other_names, s.surname]
                                  .filter(Boolean)
                                  .join(" ")}
                            </td>
                            <td>
                              {
                                income.filter((r) => r.description || r.value)
                                  .length
                              }
                            </td>
                            <td>
                              {
                                assets.filter((r) => r.description || r.value)
                                  .length
                              }
                            </td>
                            <td>
                              {
                                liabilities.filter(
                                  (r) => r.description || r.value
                                ).length
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
                <h5 className="mb-2">
                  Children ({(selectedDecl.children || []).length})
                </h5>
                {!selectedDecl.children || !selectedDecl.children.length ? (
                  <p className="text-muted small">None</p>
                ) : (
                  <Table size="sm" bordered responsive className="mb-4">
                    <thead>
                      <tr className="small">
                        <th>Name</th>
                        <th>Income Items</th>
                        <th>Assets</th>
                        <th>Liabilities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDecl.children.map((c) => {
                        const income = safeParseArray(c.biennial_income);
                        const assets = safeParseArray(c.assets);
                        const liabilities = safeParseArray(c.liabilities);
                        return (
                          <tr key={c.id} className="small">
                            <td>
                              {c.full_name ||
                                [c.first_name, c.other_names, c.surname]
                                  .filter(Boolean)
                                  .join(" ")}
                            </td>
                            <td>
                              {
                                income.filter((r) => r.description || r.value)
                                  .length
                              }
                            </td>
                            <td>
                              {
                                assets.filter((r) => r.description || r.value)
                                  .length
                              }
                            </td>
                            <td>
                              {
                                liabilities.filter(
                                  (r) => r.description || r.value
                                ).length
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
                <h5 className="mb-2">Financial (Unified)</h5>
                {!selectedDecl.financial_unified ||
                !selectedDecl.financial_unified.length ? (
                  <p className="text-muted small">No financial entries</p>
                ) : (
                  selectedDecl.financial_unified.map((m, idx) => {
                    const income = safeParseArray(m.data?.biennial_income);
                    const assets = safeParseArray(m.data?.assets);
                    const liabilities = safeParseArray(m.data?.liabilities);
                    return (
                      <Card key={idx} className="mb-3 border-0 shadow-sm">
                        <Card.Header className="py-2 d-flex justify-content-between align-items-center">
                          <div className="small">
                            <strong>{m.member_name}</strong>{" "}
                            <span className="text-muted">
                              ({m.member_type})
                            </span>
                          </div>
                          <div className="small">
                            <Badge bg="secondary" className="me-1">
                              Income{" "}
                              {
                                income.filter((r) => r.description || r.value)
                                  .length
                              }
                            </Badge>
                            <Badge bg="primary" className="me-1">
                              Assets{" "}
                              {
                                assets.filter((r) => r.description || r.value)
                                  .length
                              }
                            </Badge>
                            <Badge bg="danger">
                              Liabilities{" "}
                              {
                                liabilities.filter(
                                  (r) => r.description || r.value
                                ).length
                              }
                            </Badge>
                          </div>
                        </Card.Header>
                        <Card.Body className="pt-2 small">
                          {renderFinSection("Income", income)}
                          {renderFinSection("Assets", assets)}
                          {renderFinSection("Liabilities", liabilities)}
                          {m.data?.other_financial_info && (
                            <div className="mt-2">
                              <strong>Notes:</strong>{" "}
                              {m.data.other_financial_info}
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    );
                  })
                )}
                <h5 className="mb-2">Witness</h5>
                {selectedDecl.witness_name || selectedDecl.witness_phone ? (
                  <div className="small mb-2">
                    <div>
                      <strong>Name:</strong> {selectedDecl.witness_name || "—"}
                    </div>
                    <div>
                      <strong>Phone:</strong>{" "}
                      {selectedDecl.witness_phone || "—"}
                    </div>
                    <div>
                      <strong>Address:</strong>{" "}
                      {selectedDecl.witness_address || "—"}
                    </div>
                    <div>
                      <strong>Signed:</strong>{" "}
                      {selectedDecl.witness_signed ? "Yes" : "No"}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted small">No witness info</p>
                )}
                {selectedDecl.correction_message && (
                  <Alert variant="info" className="small py-2">
                    Correction: {selectedDecl.correction_message}
                  </Alert>
                )}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeclModal(false);
                setSelectedDecl(null);
              }}
            >
              Close
            </Button>
            {selectedDecl && (
              <Button
                variant="outline-secondary"
                onClick={() => handleExportPDF(selectedDecl)}
              >
                Export PDF
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      </Container>
    </div>
  );
};

export default LandingPage;
