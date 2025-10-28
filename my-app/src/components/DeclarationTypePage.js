import React, { useEffect, useState } from "react";
import { toISODate } from "../util/date";
import { validateDeclarationPayload } from "../util/validateDeclarationPayload";
import { normalizeDeclarationType } from "../util/normalizeDeclarationType";
import { useNavigate, useLocation } from "react-router-dom";
import { Alert, Modal, Button } from "react-bootstrap";

const DeclarationTypePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = location.state?.profile;
  const [biennialLocked, setBiennialLocked] = useState(false);
  const [firstLocked, setFirstLocked] = useState(false);
  const [finalLocked, setFinalLocked] = useState(false);
  const [serverDate, setServerDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

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

  // Helper to format date input (DD/MM/YYYY)
  const formatDate = (value) => {
    const cleanValue = value.replace(/\D/g, "");
    let formattedValue = "";
    if (cleanValue.length > 2) {
      formattedValue = `${cleanValue.slice(0, 2)}/${cleanValue.slice(2, 4)}`;
      if (cleanValue.length > 4) {
        formattedValue += `/${cleanValue.slice(4, 8)}`;
      }
    } else {
      formattedValue = cleanValue;
    }
    return formattedValue;
  };

  const handleSelect = (type) => {
    if (
      (type === "biennial" && biennialLocked) ||
      (type === "first" && firstLocked) ||
      (type === "final" && finalLocked)
    )
      return;
    // Pre-populate dates depending on declaration type before opening modal
    const parseDDMMYYYY = (s) => {
      if (!s || !/\d{2}\/\d{2}\/\d{4}/.test(s)) return new Date();
      const [dd, mm, yyyy] = s.split("/");
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    };
    const server = parseDDMMYYYY(serverDate);
    if (type === "biennial") {
      // Biennial end date should be 31/10/<oddYear>
      let year = server.getFullYear();
      if (year % 2 === 0) year += 1; // ensure odd year
      const end = `31/10/${year}`;
      setPeriodEnd(end);
      // Do not auto-set start: user may need appointment date if joined after 1 Nov previous declaration year
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
    });
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
      <h2 className="mb-4">Select Declaration Type</h2>

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
                validationErrors.length && !periodStart ? "is-invalid" : ""
              }`}
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value);
                if (validationErrors.length) setValidationErrors([]);
              }}
              style={{ borderRadius: "12px" }}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">
              Period End Date (DD/MM/YYYY)
            </label>
            <input
              type="date"
              className={`form-control py-3 ${
                validationErrors.length && !periodEnd ? "is-invalid" : ""
              }`}
              value={periodEnd}
              onChange={(e) => {
                setPeriodEnd(e.target.value);
                if (validationErrors.length) setValidationErrors([]);
              }}
              style={{ borderRadius: "12px" }}
              required
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
          {pendingType === "biennial" &&
            (() => {
              // derive odd year used for end date to show dynamic message
              const parseDDMMYYYY = (s) => {
                if (!s || !/\d{2}\/\d{2}\/\d{4}/.test(s)) return new Date();
                const [dd, mm, yyyy] = s.split("/");
                return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
              };
              const server = parseDDMMYYYY(serverDate);
              let year = server.getFullYear();
              if (year % 2 === 0) year += 1;
              const prevDeclarationYear = year - 2; // previous odd declaration cycle
              return (
                <Alert variant="info" className="mt-3">
                  <strong>Biennial Declaration Guidance:</strong>
                  <br />
                  The period end date is fixed to <b>31/10/{year}</b>.<br />
                  If you joined the County after{" "}
                  <b>01/11/{prevDeclarationYear}</b>, use your{" "}
                  <b>date of appointment</b> as the start date. Otherwise use{" "}
                  <b>01/11/{prevDeclarationYear}</b> as the start date.
                </Alert>
              );
            })()}
          {pendingType === "first" && (
            <Alert variant="info" className="mt-3">
              <strong>First (Initial) Declaration Guidance:</strong>
              <br />
              Your declaration period should cover{" "}
              <b>
                one year prior to your date of appointment up to your date of
                appointment
              </b>
              . Set the end date to your appointment date and the start date to
              one year earlier.
            </Alert>
          )}
          {pendingType === "final" &&
            (() => {
              const parseDDMMYYYY = (s) => {
                if (!s || !/\d{2}\/\d{2}\/\d{4}/.test(s)) return new Date();
                const [dd, mm, yyyy] = s.split("/");
                return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
              };
              const server = parseDDMMYYYY(serverDate);
              const year = server.getFullYear();
              const previousDeclarationYear =
                year % 2 === 0 ? year - 1 : year - 2; // last odd year cycle
              return (
                <Alert variant="info" className="mt-3">
                  <strong>Final Declaration Guidance:</strong>
                  <br />
                  Set the start date to <b>
                    31/10/{previousDeclarationYear}
                  </b>{" "}
                  (the end date of your last declaration). The end date should
                  be your <b>last day of service</b> with the County.
                </Alert>
              );
            })()}
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
            disabled={firstLocked}
            title={
              firstLocked
                ? "First Declaration is currently locked by the administrator."
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
            disabled={biennialLocked}
            title={
              biennialLocked
                ? "Biennial Declaration is currently locked by the administrator."
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
          <Alert variant="info" className="mb-3">
            <i className="fas fa-info-circle me-2"></i>
            <strong>Note:</strong> This is the biennial declaration that must be
            completed before 31st of December. Biennial declarations can{" "}
            <u>only</u> be submitted between <b>November 1</b> and{" "}
            <b>December 31</b> of an <b>odd year</b> (e.g., 2025, 2027, etc.).
          </Alert>
        </div>
        <div className="col-md-4 mb-3">
          <button
            className="btn btn-warning w-100 py-3"
            onClick={() => handleSelect("final")}
            disabled={finalLocked}
            title={
              finalLocked
                ? "Final Declaration is currently locked by the administrator."
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
