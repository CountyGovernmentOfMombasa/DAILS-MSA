import React, { useEffect, useState } from "react";
import { toISODate } from "../util/date";
import { validateDeclarationPayload } from "../util/validateDeclarationPayload";
import { normalizeDeclarationType } from "../util/normalizeDeclarationType";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Alert, Modal, Button } from "react-bootstrap";

const DeclarationTypePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = location.state?.profile;
  const [biennialLocked, setBiennialLocked] = useState(false);
  const [firstLocked, setFirstLocked] = useState(false);
  const [finalLocked, setFinalLocked] = useState(false);
  const [serverDate, setServerDate] = useState("");
  const [biennialWindow, setBiennialWindow] = useState(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // Check if essential profile information is missing
  const isProfileIncomplete =
    !profile?.designation ||
    !profile?.department ||
    !profile?.sub_department;

  useEffect(() => {
    // Fetch all lock states from backend (public read-only route)
    fetch("/api/settings/locks")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.locks) {
          setBiennialLocked(!!data.locks.biennial_declaration_locked);
          setFirstLocked(!!data.locks.first_declaration_locked);
          setFinalLocked(!!data.locks.final_declaration_locked);
        }
      })
      .catch(() => {
        setBiennialLocked(false);
        setFirstLocked(false);
        setFinalLocked(false);
      });
    // Fetch server date for declaration
    fetch("/api/server-date")
      .then((res) => res.json())
      .then((data) => {
        if (data.date) setServerDate(data.date);
      });
  }, []);

  // Fetch active biennial window using server year when available
  useEffect(() => {
    const parseDDMMYYYY = (s) => {
      if (!s || !/\d{2}\/\d{2}\/\d{4}/.test(s)) return null;
      const [dd, mm, yyyy] = s.split("/");
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    };
    const d = parseDDMMYYYY(serverDate) || new Date();
    const year = d.getFullYear();
    fetch(`/api/windows/biennial?year=${year}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setBiennialWindow(data.window || null);
      })
      .catch(() => setBiennialWindow(null));
  }, [serverDate]);

  const handleSelect = (type) => {
    if (
      (type === "biennial" && biennialLocked) ||
      (type === "first" && firstLocked) ||
      (type === "final" && finalLocked)
    )
      return;
    // Pre-populate dates depending on declaration type before opening modal
    if (type === "biennial") {
      // Use configured window if available; no legacy fallback
      if (biennialWindow && biennialWindow.start_date && biennialWindow.end_date) {
        setPeriodStart(biennialWindow.start_date);
        setPeriodEnd(biennialWindow.end_date);
      } else {
        setPeriodStart("");
        setPeriodEnd("");
      }
    } else if (type === "final") {
      // Clear pre-filled end/start for final to let user specify leaving date
      setPeriodEnd("");
    } else if (type === "first") {
      setPeriodEnd("");
    }
    setPendingType(type);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setPeriodStart("");
    setPeriodEnd("");
    setPendingType(null);
    setValidationErrors([]);
  };

  // date util imported

  const handleModalProceed = () => {
    // Format all relevant dates before validation/navigation
    const formattedServerDate = toISODate(serverDate);
    const formattedPeriodStart = toISODate(periodStart);
    const formattedPeriodEnd = toISODate(periodEnd);
    // Normalize pending type to backend canonical form
    const backendType = normalizeDeclarationType(pendingType);
    // Validate payload before navigating
    const { valid, errors, normalizedType } = validateDeclarationPayload({
      declaration_type: backendType,
      declaration_date: formattedServerDate,
      period_start_date: formattedPeriodStart,
      period_end_date: formattedPeriodEnd,
    }, { window: biennialWindow });
    if (!valid) {
      setValidationErrors(errors);
      return; // keep modal open
    }
    setValidationErrors([]);
    // If profile has a birth date, format it as well
    let formattedProfile = profile;
    if (profile && profile.birthdate) {
      formattedProfile = {
        ...profile,
        birthdate: toISODate(profile.birthdate),
      };
    }
    // Persist period info to sessionStorage so downstream steps can recover
    try {
      sessionStorage.setItem(
        "declarationPeriod",
        JSON.stringify({
          declaration_type: normalizedType,
          declaration_date: formattedServerDate,
          period_start: formattedPeriodStart,
          period_end: formattedPeriodEnd,
          declarationType: normalizedType,
          declarationDate: formattedServerDate,
          periodStart: formattedPeriodStart,
          periodEnd: formattedPeriodEnd,
        })
      );
    } catch (e) {
      /* ignore storage errors */
    }
    setShowModal(false);
    navigate("/guidnotes", {
      state: {
        declarationType: normalizedType,
        declarationDate: formattedServerDate,
        periodStart: formattedPeriodStart,
        periodEnd: formattedPeriodEnd,
        profile: formattedProfile,
      },
    });
    setPeriodStart("");
    setPeriodEnd("");
    setPendingType(null);
  };

  return (
    <div className="container py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Select Declaration Type</h2>
        <Button
          variant="outline-secondary"
          onClick={() => navigate("/landing")}
        >
          <i className="fas fa-arrow-left me-2"></i>Back to Home
        </Button>
      </div>

      {isProfileIncomplete && (
        <Alert variant="danger">
          <i className="fas fa-exclamation-triangle me-2"></i>
          <strong>Profile Incomplete:</strong> Your department and
          sub-department are not set. Please return to the{" "}
          <Link to="/landing" className="alert-link">
            Home Page
          </Link>{" "}
          to update your profile before proceeding.
        </Alert>
      )}
      {/* Declaration Period Modal */}
      <Modal show={showModal} onHide={handleModalClose} centered>
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Declaration Period</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <label className="form-label fw-semibold">
              Date of Submission (DD/MM/YYYY)
            </label>
            <input
              type="text"
              className="form-control bg-light py-3"
              value={serverDate}
              readOnly
              disabled
              style={{ borderRadius: "12px" }}
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">
              Period Start Date (DD/MM/YYYY)
            </label>
            <input
              type="date"
              className={`form-control py-3 ${
                validationErrors.length && !toISODate(periodStart)
                  ? "is-invalid"
                  : ""
              }`}
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value);
                if (validationErrors.length) setValidationErrors([]);
              }}
              style={{ borderRadius: "12px" }}
              required
              readOnly={pendingType === "biennial"}
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">
              Period End Date (DD/MM/YYYY)
            </label>
            <input
              type="date"
              className={`form-control py-3 ${
                validationErrors.length && !toISODate(periodEnd)
                  ? "is-invalid"
                  : ""
              }`}
              value={periodEnd}
              onChange={(e) => {
                setPeriodEnd(e.target.value);
                if (validationErrors.length) setValidationErrors([]);
              }}
              style={{ borderRadius: "12px" }}
              required
              readOnly={pendingType === "biennial"}
            />
            {validationErrors.length > 0 && (
              <div className="mt-3">
                {validationErrors.map((err, i) => (
                  <div
                    key={i}
                    className="alert alert-danger py-2 mb-2"
                    style={{ borderRadius: "8px" }}
                  >
                    {err}
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="text-muted">
            These dates will be used as the official period of your declaration.
          </span>
          {/* Contextual guidance based on declaration type */}
          {pendingType === "biennial" && (
            <Alert variant={biennialWindow ? "info" : "warning"} className="mt-3">
              <i className="fas fa-info-circle me-2"></i>
              {biennialWindow ? (
                <span>
                  <strong>Biennial Window:</strong> Submissions are open from <b>{biennialWindow.start_date}</b> to <b>{biennialWindow.end_date}</b>{biennialWindow.year ? ` (Year: ${biennialWindow.year})` : ''}.
                </span>
              ) : (
                <span>
                  <strong>Closed:</strong> Biennial declarations are currently closed. The administrator may open a window at any time.
                </span>
              )}
            </Alert>
          )}
          {pendingType === "first" && (
            <Alert variant="info" className="mt-3">
              <strong>First (Initial) Declaration Guidance:</strong>
              <br />
              Your declaration period should reflect your first year up to the statement date.
            </Alert>
          )}
          {pendingType === "final" && (
            <Alert variant="info" className="mt-3">
              <strong>Final Declaration Guidance:</strong>
              <br />
              Set the start date to the end date of your last declaration. The end date should be your last day of service with the County.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleModalClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleModalProceed}
            disabled={!periodStart || !periodEnd}
          >
            Proceed
          </Button>
        </Modal.Footer>
      </Modal>

      <div className="row">
        <div className="col-md-4 mb-3">
          <button
            className="btn btn-primary w-100 py-3"
            onClick={() => handleSelect("first")}
            disabled={firstLocked || isProfileIncomplete}
            title={
              firstLocked
                ? "First Declaration is currently locked by the administrator."
                : isProfileIncomplete
                ? "Please complete your profile (department/sub-department) to enable this option."
                : ""
            }
          >
            Initial Declaration
            {firstLocked && (
              <span
                style={{ color: "red", fontSize: "0.9em", display: "block" }}
              >
                (Locked)
              </span>
            )}
          </button>
        </div>
        <div>
          {firstLocked && (
            <Alert variant="danger" className="mb-3">
              <i className="fas fa-lock me-2"></i>
              <strong>
                First Declaration is currently locked by the administrator. You
                cannot submit a first declaration at this time.
              </strong>
            </Alert>
          )}
          <Alert variant="info" className="mb-3">
            <i className="fas fa-info-circle me-2"></i>
            <strong>Note:</strong> This is for new workers who have just joined
            the county and should be done within the first 30 days of joining.
          </Alert>
        </div>
        <div className="col-md-4 mb-3">
          <button
            className="btn btn-success w-100 py-3"
            onClick={() => handleSelect("biennial")}
            disabled={biennialLocked || isProfileIncomplete}
            title={
              biennialLocked
                ? "Biennial Declaration is currently locked by the administrator."
                : isProfileIncomplete
                ? "Please complete your profile (department/sub-department) to enable this option."
                : ""
            }
          >
            Biennial Declaration
            {biennialLocked && (
              <span
                style={{ color: "red", fontSize: "0.9em", display: "block" }}
              >
                (Locked)
              </span>
            )}
          </button>
        </div>
        <div>
          <Alert variant={biennialWindow ? "info" : "warning"} className="mb-3">
            <i className="fas fa-info-circle me-2"></i>
            {biennialWindow ? (
              <span>
                <strong>Note:</strong> Biennial declarations are currently open from <b>{biennialWindow.start_date}</b> to <b>{biennialWindow.end_date}</b>{biennialWindow.year ? ` (Year: ${biennialWindow.year})` : ''}.
              </span>
            ) : (
              <span>
                <strong>Note:</strong> Biennial declarations are currently closed. The administrator may open a window at any time.
              </span>
            )}
          </Alert>
        </div>
        <div className="col-md-4 mb-3">
          <button
            className="btn btn-warning w-100 py-3"
            onClick={() => handleSelect("final")}
            disabled={finalLocked || isProfileIncomplete}
            title={
              finalLocked
                ? "Final Declaration is currently locked by the administrator."
                : isProfileIncomplete
                ? "Please complete your profile (department/sub-department) to enable this option."
                : ""
            }
          >
            Final Declaration
            {finalLocked && (
              <span
                style={{ color: "red", fontSize: "0.9em", display: "block" }}
              >
                (Locked)
              </span>
            )}
          </button>
        </div>
        <div>
          {finalLocked && (
            <Alert variant="danger" className="mb-3">
              <i className="fas fa-lock me-2"></i>
              <strong>
                Final Declaration is currently locked by the administrator. You
                cannot submit a final declaration at this time.
              </strong>
            </Alert>
          )}
          <Alert variant="info" className="mb-3">
            <i className="fas fa-info-circle me-2"></i>
            <strong>Note:</strong> This is only for the workers who have
            resigned or retired from the County.
          </Alert>
        </div>
      </div>
    </div>
  );
};

export default DeclarationTypePage;
