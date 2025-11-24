import React, { useState, useEffect, useRef } from "react";
import { NATURE_OF_EMPLOYMENT_OPTIONS } from "../constants/employment";
import { toISODate } from "../util/date";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Spinner,
  ProgressBar,
} from "react-bootstrap";
import { useDepartments } from "../hooks/useDepartments";
import {
  DeclarationSessionProvider,
  useDeclarationSession,
  useDebouncedPatch,
} from "../context/DeclarationSessionContext";
import {
  getEditContext,
  appendDeclarationIdToPath,
  clearEditContext,
  removeDeclarationIdFromPath,
} from "../utilis/editContext";
import {
  saveProgress,
  deriveUserKey,
  scheduleServerSync,
} from "../utilis/persistProgress";

const UserFormInner = () => {
  const location = useLocation();
  const { declarationDate, periodStart, periodEnd, profile } =
    location.state || {};
  const declarationType = location.state?.declarationType || "";
  const { model, savingState } = useDeclarationSession();
  const editContext = getEditContext({
    locationState: location.state,
    locationSearch: location.search,
  });
  const isEditingExisting = !!editContext.declarationId;
  const [userData, setUserData] = useState(() => {
    if (profile) {
      const employmentNature =
        profile.employment_nature || profile.nature_of_employment || "";
      return {
        ...profile,
        employment_nature: employmentNature,
        nature_of_employment: employmentNature,
        declaration_type: declarationType,
      };
    }
    return {
      surname: "",
      first_name: "",
      other_names: "",
      birthdate: "",
      place_of_birth: "",
      marital_status: "",
      postal_address: "",
      physical_address: "",
      email: "",
      national_id: "",
      payroll_number: "",
      designation: "",
      department: "",
      sub_department: "",
      employment_nature: "",
      nature_of_employment: "",
      declaration_type: declarationType,
    };
  });
  const [existingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biennialLocked, setBiennialLocked] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const draftTimeout = useRef();
  useEffect(() => {
    if (!token) return;
    if (draftTimeout.current) clearTimeout(draftTimeout.current);
    draftTimeout.current = setTimeout(() => {
      const key = deriveUserKey(userData);
      saveProgress(
        {
          lastStep: "user",
          stateSnapshot: { declarationDate, periodStart, periodEnd, userData },
        },
        key
      );
      scheduleServerSync(key, token);
    }, 500);
    return () => clearTimeout(draftTimeout.current);
  }, [userData, token, declarationDate, periodStart, periodEnd]);

  useEffect(() => {
    if (declarationType === "biennial") {
      fetch("/api/settings/locks")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.locks)
            setBiennialLocked(Boolean(data.locks.biennial_declaration_locked));
        })
        .catch(() => setBiennialLocked(false));
    }
    if (model) {
      setUserData((prev) => ({
        ...prev,
        ...model.profile,
        declaration_type: model.type,
      }));
      setIsLoading(false);
      return;
    }
    if (!profile) {
      if (!token) {
        navigate("/login");
        return;
      }
      fetch("/api/users/profile", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((p) => {
          if (p)
            setUserData((prev) => ({
              ...prev,
              ...p,
              declaration_type: declarationType,
            }));
        })
        .catch((err) => console.error("Error fetching user profile:", err))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [
    declarationType,
    profile,
    token,
    navigate,
    location.state,
    location.search,
    model,
  ]);

  const {
    subToParent: SUB_DEPARTMENT_PARENT,
    subDepartments: SUB_DEPARTMENTS,
    loading: deptLoading,
    error: deptError,
    reload: reloadDepts,
  } = useDepartments();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => {
      if (name === "sub_department") {
        const parent = SUB_DEPARTMENT_PARENT[value] || "";
        return { ...prev, sub_department: value, department: parent };
      }
      if (name === "department") {
        if (
          prev.sub_department &&
          SUB_DEPARTMENT_PARENT[prev.sub_department] !== value
        ) {
          return { ...prev, department: value, sub_department: "" };
        }
      }
      return { ...prev, [name]: value };
    });
  };

  useDebouncedPatch(
    [userData.marital_status, isEditingExisting, model?.id],
    () => {
      if (!isEditingExisting || !model?.id) return null;
      if (!userData.marital_status) return null;
      return { marital_status: userData.marital_status };
    },
    400
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const formattedUserData = {
      ...userData,
      birthdate: toISODate(userData.birthdate),
      declaration_type: declarationType,
    };
    const key = deriveUserKey(formattedUserData);
    const fullUserData = { ...profile, ...formattedUserData };
    saveProgress(
      {
        lastStep: "spouse",
        stateSnapshot: {
          declarationDate,
          periodStart,
          periodEnd,
          userData: fullUserData,
        },
      },
      key
    );
    scheduleServerSync(key, token);
    const nextPath = appendDeclarationIdToPath(
      "/spouse-form",
      getEditContext({
        locationState: location.state,
        locationSearch: location.search,
      }).declarationId
    );
    navigate(nextPath, {
      state: {
        ...location.state,
        userData: fullUserData,
        declarationDate,
        periodStart,
        periodEnd,
      },
    });
  };

  if (declarationType === "biennial" && biennialLocked) {
    return (
      <div className="alert alert-danger mt-5 text-center">
        Biennial Declaration is currently locked by the administrator.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)",
        }}
        className="d-flex align-items-center justify-content-center"
      >
        <div className="text-center">
          <Spinner animation="border" variant="primary" className="mb-3" />
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)",
      }}
      className="py-5"
    >
      <Container>
        {isEditingExisting && (
          <div className="d-flex justify-content-end mb-2 small">
            {savingState.busy ? (
              <span className="badge bg-warning text-dark">Saving...</span>
            ) : savingState.last ? (
              <span className="badge bg-success">
                Saved {savingState.mode} at{" "}
                {savingState.last.toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        )}
        {getEditContext({
          locationState: location.state,
          locationSearch: location.search,
        }).declarationId && (
          <div
            className="alert alert-info mb-3 d-flex justify-content-between align-items-start"
            role="alert"
            style={{ borderRadius: "10px" }}
          >
            <div>
              <strong>Editing existing declaration</strong>
              {(() => {
                const ctx = getEditContext({
                  locationState: location.state,
                  locationSearch: location.search,
                });
                return ctx.declarationId ? (
                  <>
                    {" "}
                    — ID: <code>{ctx.declarationId}</code>
                  </>
                ) : null;
              })()}
              {(() => {
                const ctx = getEditContext({
                  locationState: location.state,
                  locationSearch: location.search,
                });
                return ctx.editInfo?.reason ? (
                  <>
                    <br />
                    Reason: <em>{ctx.editInfo.reason}</em>
                  </>
                ) : null;
              })()}
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  const ctx = getEditContext({
                    locationState: location.state,
                    locationSearch: location.search,
                  });
                  const editPath = appendDeclarationIdToPath(
                    "/edit-declaration",
                    ctx.declarationId
                  );
                  navigate(editPath, { state: { ...location.state } });
                }}
              >
                <i className="fas fa-arrow-left me-1"></i>
                Back to Edit Declaration
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => {
                  clearEditContext();
                  const clean = removeDeclarationIdFromPath(
                    window.location.pathname + window.location.search
                  );
                  navigate(clean, {
                    replace: true,
                    state: {
                      ...location.state,
                      declarationId: undefined,
                      editInfo: undefined,
                    },
                  });
                }}
              >
                <i className="fas fa-times me-1"></i>
                Clear edit context
              </button>
            </div>
          </div>
        )}
        <Row className="justify-content-center">
          <Col lg={10}>
            <Card className="shadow-lg border-0">
              <Card.Body className="p-5">
                <div className="text-center mb-4">
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                    style={{
                      width: "80px",
                      height: "80px",
                      background:
                        "linear-gradient(45deg, var(--primary-blue), var(--secondary-green))",
                    }}
                  >
                    <i
                      className="fas fa-user text-white"
                      style={{ fontSize: "2rem" }}
                    ></i>
                  </div>
                  <h2 className="fw-bold text-dark mb-2">
                    Personal Information
                  </h2>
                  <p className="text-muted">Step 1 of 4</p>
                  <ProgressBar
                    now={25}
                    className="mb-4"
                    style={{ height: "8px" }}
                  />
                </div>

                <Form onSubmit={handleSubmit}>
                  {/* Section A: Name */}
                  <Card className="mb-4">
                    <Card.Header className="bg-primary text-white">
                      <h5 className="mb-0">A. Name of public officer</h5>
                    </Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-surname"
                              className="fw-semibold"
                            >
                              i) Surname
                            </Form.Label>
                            <Form.Control
                              id="userform-surname"
                              autoComplete="family-name"
                              type="text"
                              name="surname"
                              value={existingData?.surname || userData.surname}
                              onChange={handleChange}
                              // not required
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-first-name"
                              className="fw-semibold"
                            >
                              ii) First Name
                            </Form.Label>
                            <Form.Control
                              id="userform-first-name"
                              autoComplete="given-name"
                              type="text"
                              name="first_name"
                              value={
                                existingData?.first_name || userData.first_name
                              }
                              onChange={handleChange}
                              required
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-other-names"
                              className="fw-semibold"
                            >
                              iii) Other Names
                            </Form.Label>
                            <Form.Control
                              id="userform-other-names"
                              autoComplete="additional-name"
                              type="text"
                              name="other_names"
                              value={
                                existingData?.other_names ||
                                userData.other_names
                              }
                              onChange={handleChange}
                              required
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  {/* Section B: Birth Information */}
                  <Card className="mb-4">
                    <Card.Header className="bg-success text-white">
                      <h5 className="mb-0">B. Birth Information</h5>
                    </Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-birthdate"
                              className="fw-semibold"
                            >
                              i) Date of Birth
                            </Form.Label>
                            <Form.Control
                              id="userform-birthdate"
                              autoComplete="bday"
                              type="date"
                              name="birthdate"
                              placeholder="YYYY-MM-DD"
                              value={toISODate(
                                existingData?.birthdate || userData.birthdate
                              )}
                              onChange={(e) =>
                                setUserData({
                                  ...userData,
                                  birthdate: e.target.value,
                                })
                              }
                              required
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-place-of-birth"
                              className="fw-semibold"
                            >
                              ii) Place of Birth
                            </Form.Label>
                            <Form.Control
                              id="userform-place-of-birth"
                              autoComplete="address-level2"
                              type="text"
                              name="place_of_birth"
                              value={
                                existingData?.place_of_birth ||
                                userData.place_of_birth
                              }
                              onChange={handleChange}
                              className="py-3"
                              placeholder="City, Country"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  {/* Section C: Marital Status */}
                  <Card className="mb-4">
                    <Card.Header className="bg-info text-white">
                      <h5 className="mb-0">C. Marital Status</h5>
                    </Card.Header>
                    <Card.Body>
                      <Form.Group className="mb-3">
                        <Form.Label
                          htmlFor="userform-marital-status"
                          className="fw-semibold"
                        >
                          Marital Status
                        </Form.Label>
                        <Form.Select
                          id="userform-marital-status"
                          autoComplete="marital-status"
                          name="marital_status"
                          value={
                            existingData?.marital_status ||
                            userData.marital_status
                          }
                          onChange={handleChange}
                          required
                          className="py-3"
                          style={{ borderRadius: "12px" }}
                        >
                          <option value="">Select status</option>
                          <option value="single">Single</option>
                          <option value="married">Married</option>
                          <option value="divorced">Divorced</option>
                          <option value="widowed">Widowed</option>
                          <option value="separated">Separated</option>
                        </Form.Select>
                      </Form.Group>
                    </Card.Body>
                  </Card>

                  {/* Section D: Address */}
                  <Card className="mb-4">
                    <Card.Header className="bg-warning text-dark">
                      <h5 className="mb-0">D. Address</h5>
                    </Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-postal-address"
                              className="fw-semibold"
                            >
                              i) Postal Address
                            </Form.Label>
                            <Form.Control
                              id="userform-postal-address"
                              autoComplete="postal-code"
                              type="text"
                              name="postal_address"
                              value={
                                existingData?.postal_address ||
                                userData.postal_address
                              }
                              onChange={handleChange}
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                              placeholder="e.g., 00000 - 00000"
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-physical-address"
                              className="fw-semibold"
                            >
                              ii) Physical Address
                            </Form.Label>
                            <Form.Control
                              id="userform-physical-address"
                              autoComplete="street-address"
                              as="textarea"
                              rows={3}
                              name="physical_address"
                              value={
                                existingData?.physical_address ||
                                userData.physical_address
                              }
                              onChange={handleChange}
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                              placeholder="Street, City, County"
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-email"
                              className="fw-semibold"
                            >
                              Email Address
                            </Form.Label>
                            <Form.Control
                              id="userform-email"
                              autoComplete="email"
                              type="email"
                              name="email"
                              value={existingData?.email || userData.email}
                              onChange={handleChange}
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  {/* Section E: Employment Information */}
                  <Card className="mb-4">
                    <Card.Header className="bg-secondary text-white">
                      <h5 className="mb-0">E. Employment Information</h5>
                    </Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-national-id"
                              className="fw-semibold"
                            >
                              i) National ID Number
                            </Form.Label>
                            <Form.Control
                              id="userform-national-id"
                              autoComplete="national-identification-number"
                              type="text"
                              name="national_id"
                              value={
                                existingData?.national_id ||
                                userData.national_id
                              }
                              onChange={handleChange}
                              required
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                              placeholder="Enter your National ID number"
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-payroll-number"
                              className="fw-semibold"
                            >
                              ii) Payroll Number (optional)
                            </Form.Label>
                            <Form.Control
                              id="userform-payroll-number"
                              autoComplete="off"
                              type="text"
                              name="payroll_number"
                              value={
                                existingData?.payroll_number ||
                                userData.payroll_number
                              }
                              onChange={handleChange}
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                              placeholder="Enter your Payroll Number (optional)"
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-sub-department"
                              className="fw-semibold"
                            >
                              iii) Sub Department
                            </Form.Label>
                            <Form.Select
                              id="userform-sub-department"
                              aria-label="Sub Department"
                              name="sub_department"
                              value={
                                existingData?.sub_department ||
                                userData.sub_department ||
                                ""
                              }
                              onChange={handleChange}
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            >
                              <option value="">Select sub department</option>
                              {SUB_DEPARTMENTS.map((sd) => (
                                <option key={sd} value={sd}>
                                  {sd}
                                </option>
                              ))}
                            </Form.Select>
                            {deptLoading && (
                              <div className="small text-muted mt-1">
                                Loading departments...
                              </div>
                            )}
                            {deptError && (
                              <div className="small text-warning mt-1">
                                Failed to load latest departments: {deptError}{" "}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary ms-2"
                                  onClick={reloadDepts}
                                >
                                  Retry
                                </button>
                              </div>
                            )}
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-department"
                              className="fw-semibold"
                            >
                              iii a) Department (auto)
                            </Form.Label>
                            <Form.Control
                              id="userform-department"
                              type="text"
                              name="department"
                              value={
                                existingData?.department || userData.department
                              }
                              readOnly
                              placeholder="Derived from Sub Department"
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label
                              htmlFor="userform-nature-employment"
                              className="fw-semibold"
                            >
                              iv) Nature of Employment
                            </Form.Label>
                            <Form.Select
                              id="userform-nature-employment"
                              aria-label="Nature of Employment"
                              name="nature_of_employment"
                              value={userData.nature_of_employment || ""}
                              onChange={handleChange}
                              className="py-3"
                              style={{ borderRadius: "12px" }}
                            >
                              <option value="">Select employment type</option>
                              {NATURE_OF_EMPLOYMENT_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </Form.Select>
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  <div className="d-flex justify-content-between pt-3">
                    <div>
                      <Button
                        variant="outline-secondary"
                        onClick={() =>
                          navigate("/landing", { state: { ...location.state } })
                        }
                        className="px-4 py-3 me-2"
                        style={{ borderRadius: "12px" }}
                      >
                        Back to Home
                      </Button>
                      {location.state?.fromReview && (
                        <Button
                          variant="outline-primary"
                          onClick={() => {
                            const ctx = getEditContext({
                              locationState: location.state,
                              locationSearch: location.search,
                            });
                            const reviewPath = appendDeclarationIdToPath(
                              "/review",
                              ctx.declarationId
                            );
                            navigate(reviewPath, {
                              state: { ...location.state },
                            });
                          }}
                          className="px-4 py-3"
                          style={{ borderRadius: "12px" }}
                        >
                          <i className="fas fa-list me-2"></i>
                          Back to Review
                        </Button>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="px-5 py-3 fw-semibold"
                      style={{
                        borderRadius: "12px",
                        background:
                          "linear-gradient(45deg, var(--primary-blue), #0056b3)",
                        border: "none",
                      }}
                    >
                      Next Step
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

const UserForm = () => {
  const { declarationId } = getEditContext({
    locationState: null,
    locationSearch: window.location.search,
  });
  return (
    <DeclarationSessionProvider declarationId={declarationId}>
      <UserFormInner />
    </DeclarationSessionProvider>
  );
};

export default UserForm;
