import React, { useEffect, useState } from "react";
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
  InputGroup,
} from "react-bootstrap";
import { resendOtp, verifyOtp } from "../api";
import ForgotPasswordUser from "./ForgotPasswordUser";
import { useUser } from "../context/UserContext";

const LoginPage = () => {
  const [nationalId, setNationalId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [requirePhone, setRequirePhone] = useState(false);
  const [showDefaultPasswordInfo, setShowDefaultPasswordInfo] = useState(false);
  // Restore OTP step & cooldown after refresh
  useEffect(() => {
    const stepActive = sessionStorage.getItem("otpStepActive") === "1";
    const storedToken = sessionStorage.getItem("otpToken") || "";
    const storedNationalId = sessionStorage.getItem("loginNationalId") || "";
    const storedPhone = sessionStorage.getItem("loginPhoneNormalized") || "";
    if (storedNationalId) setNationalId(storedNationalId);
    if (storedPhone) setPhoneNumber(storedPhone);
    if (stepActive && storedToken) {
      setOtpRequired(true);
      setOtpToken(storedToken);
      const until = parseInt(
        sessionStorage.getItem("otpCooldownUntil") || "0",
        10
      );
      if (until && until > Date.now()) {
        setResendCooldown(Math.ceil((until - Date.now()) / 1000));
      }
      setInfo("Enter the OTP sent to your phone to continue.");
    }
  }, []);

  const handleNationalIdBlur = async () => {
    if (nationalId.trim()) {
      try {
        const response = await fetch("/api/auth/check-password-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nationalId: nationalId.trim() }),
        });
        if (response.ok) {
          const data = await response.json();
          if (!data.phone_number) {
            // New user without phone on record: require phone entry, but still show password field
            setRequirePhone(true);
            if (!data.password_changed) {
              // Provide default password guidance
              setPassword("Change@001");
              setShowDefaultPasswordInfo(true);
            } else {
              setPassword("");
              setShowDefaultPasswordInfo(false);
            }
          } else {
            setRequirePhone(false);
            if (!data.password_changed) {
              setPassword("Change@001");
              setShowDefaultPasswordInfo(true);
            } else {
              setPassword("");
              setShowDefaultPasswordInfo(false);
            }
          }
        }
      } catch {
        setShowDefaultPasswordInfo(false);
      }
    } else {
      setShowDefaultPasswordInfo(false);
      setRequirePhone(false);
    }
  };

  // This effect is now removed, as the logic is handled by onBlur.
  // useEffect(() => { ... }, [nationalId]);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();
  const { refreshProfile } = useUser();

  // Stepper + Resend cooldown
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpToken, setOtpToken] = useState("");
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0); // seconds

  useEffect(() => {
    if (!otpRequired) return;
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => clearInterval(t);
  }, [otpRequired, resendCooldown]);

  const formatTime = (s) => `0:${String(s).padStart(2, "0")}`;

  // Phone normalization (Kenyan defaults)
  const normalizePhone = (raw) => {
    if (!raw) return "";
    let digits = String(raw).replace(/\D/g, "");
    if (digits.startsWith("254") && digits.length === 12) {
      digits = "0" + digits.slice(3);
    } else if (digits.startsWith("7") && digits.length === 9) {
      digits = "0" + digits;
    } else if (digits.startsWith("2547") && digits.length === 13) {
      digits = "0" + digits.slice(3);
    }
    return digits;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      let loginData = {
        nationalId: nationalId.trim(),
        password: password,
      };
      if (requirePhone) {
        const normalized = normalizePhone(phoneNumber.trim());
        if (!/^0\d{9}$/.test(normalized)) {
          setError("Enter a valid Kenyan phone number (e.g., 0712345678).");
          setIsLoading(false);
          return;
        }
        loginData.phoneNumber = normalized;
      }
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginData),
      });

      if (response.ok) {
        const data = await response.json();
        // OTP-first flow for first-time login
        if (data.otpRequired) {
          setOtpRequired(true);
          setOtpToken(data.token);
          setInfo("Enter the OTP sent to your phone to continue.");
          const until = Date.now() + 60 * 1000;
          sessionStorage.setItem("otpStepActive", "1");
          sessionStorage.setItem("otpToken", data.token);
          sessionStorage.setItem("otpCooldownUntil", String(until));
          setResendCooldown(60);
          return; // stop here; show OTP form below
        } else if (data.changePasswordRequired) {
          navigate("/change-password", {
            state: { token: data.token },
          });
        } else {
          // Store user access token(s) + new admin hint flags
          localStorage.setItem("token", data.token);
          if (data.refreshToken)
            localStorage.setItem("refreshToken", data.refreshToken);
          if (data.accessExpiresInMs) {
            localStorage.setItem(
              "tokenExpiresAt",
              String(Date.now() + data.accessExpiresInMs)
            );
          }
          if (typeof data.hasAdminAccess !== "undefined") {
            localStorage.setItem(
              "hasAdminAccess",
              data.hasAdminAccess ? "1" : "0"
            );
          }
          if (data.adminRole) {
            localStorage.setItem("adminRawRoleHint", data.adminRole);
          } else {
            localStorage.removeItem("adminRawRoleHint");
          }
          // Immediately warm profile cache; no flicker on landing
          await refreshProfile();
          navigate("/landing");
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 423) {
          // Account locked
          setError(
            errorData.message ||
              "Account suspended due to multiple failed attempts."
          );
          return;
        }
        if (response.status === 429) {
          setError(
            errorData.message || "Too many attempts. Please wait and try again."
          );
          return;
        }
        if (errorData.code === "FIRST_TIME_DEFAULT_PASSWORD_REQUIRED") {
          setError("For first-time login use the default password: Change@001");
        } else {
          setError(errorData.message || "Invalid credentials");
        }
        console.error(
          "Login failed:",
          errorData.message || "Invalid credentials"
        );
      }
    } catch (err) {
      setError("Login failed. Please try again.");
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Live re-check when phone number becomes valid (improves UX by revealing password field asap on subsequent attempts)
  useEffect(() => {
    if (!requirePhone) return;
    if (!nationalId.trim()) return;
    const normalized = normalizePhone(phoneNumber.trim());
    if (/^0\d{9}$/.test(normalized)) {
      // debounce slight to avoid spamming
      const t = setTimeout(async () => {
        try {
          const response = await fetch("/api/auth/check-password-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nationalId: nationalId.trim() }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.phone_number) {
              // Phone now on record -> revert to password flow
              setRequirePhone(false);
              if (!data.password_changed) {
                setPassword("Change@001");
                setShowDefaultPasswordInfo(true);
              } else {
                setPassword("");
                setShowDefaultPasswordInfo(false);
              }
            }
          }
        } catch {
          /* ignore */
        }
      }, 600);
      return () => clearTimeout(t);
    }
  }, [phoneNumber, requirePhone, nationalId]);

  const handleResendOtp = async () => {
    setError("");
    setInfo("");
    try {
      // Backend expects default password for resend OTP
      await resendOtp({
        nationalId: nationalId.trim(),
        password: "Change@001",
      });
      setInfo("OTP resent. Please check your phone.");
      const until = Date.now() + 60 * 1000;
      sessionStorage.setItem("otpCooldownUntil", String(until));
      setResendCooldown(60);
    } catch (e) {
      if (e?.response?.status === 429) {
        setError(
          "You’ve requested codes too often. Please wait and try again."
        );
      } else {
        setError("Failed to resend OTP.");
      }
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setInfo("");
    try {
      if (!/^\d{6}$/.test(otp)) {
        setError("Enter the 6-digit code.");
        setIsLoading(false);
        return;
      }
      const { data } = await verifyOtp(otpToken, otp);
      if (data.changePasswordRequired && data.token) {
        sessionStorage.removeItem("otpStepActive");
        sessionStorage.removeItem("otpToken");
        sessionStorage.removeItem("otpCooldownUntil");
        navigate("/change-password", { state: { token: data.token } });
      } else {
        setError("Unexpected response.");
      }
    } catch (e) {
      if (e?.response?.status === 429) {
        setError(
          "Too many attempts. Please wait a moment before trying again."
        );
        setIsLoading(false);
        return;
      }
      const msg = e?.response?.data?.message || "Invalid OTP";
      if (/expired/i.test(msg)) {
        setError("Your code has expired. Please resend a new OTP.");
      } else if (/invalid/i.test(msg)) {
        setError("The code you entered is not correct. Please try again.");
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)",
      }}
      className="d-flex align-items-center"
    >
      <Container>
        <Row className="justify-content-center">
          <Col md={6} lg={4}>
            <Card className="shadow-lg border-0">
              <Card.Body className="p-5">
                {/* Header */}
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
                  <h2 className="fw-bold text-dark mb-2">Login</h2>
                  <p className="text-muted">
                    Enter your credentials to continue
                  </p>
                </div>

                {!otpRequired && !showForgot && (
                  <Form onSubmit={handleLogin}>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">
                        National ID Number
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter your National ID number"
                        value={nationalId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setNationalId(v);
                          sessionStorage.setItem("loginNationalId", v);
                        }}
                        onBlur={handleNationalIdBlur}
                        required
                        className="py-3"
                        style={{ borderRadius: "12px" }}
                      />
                    </Form.Group>
                    {requirePhone && (
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-semibold">
                          Phone Number
                        </Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="07xx xxx xxx"
                          value={phoneNumber}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPhoneNumber(v);
                            const n = normalizePhone(v);
                            sessionStorage.setItem("loginPhoneNormalized", n);
                            // If becomes valid, reveal password field dynamically
                            if (/^0\d{9}$/.test(n)) {
                              setError("");
                            }
                          }}
                          required
                          className="py-3"
                          style={{ borderRadius: "12px" }}
                        />
                        <Alert variant="info" className="mt-2">
                          Please provide your phone number to continue. We'll
                          normalize it (e.g., 0712345678).
                        </Alert>
                      </Form.Group>
                    )}
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">Password</Form.Label>
                      <InputGroup>
                        <Form.Control
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="py-3"
                          style={{ borderRadius: "12px" }}
                        />
                        <Button
                          variant="outline-secondary"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          <i
                            className={`fas ${
                              showPassword ? "fa-eye-slash" : "fa-eye"
                            }`}
                          />
                        </Button>
                      </InputGroup>
                      {showDefaultPasswordInfo && (
                        <Alert variant="info" className="mt-2">
                          Your default password is <b>Change@001</b>. Please
                          change it after logging in.
                        </Alert>
                      )}
                    </Form.Group>

                    {error && (
                      <Alert variant="danger" className="mb-3">
                        {error}
                      </Alert>
                    )}
                    {info && (
                      <Alert variant="info" className="mb-3">
                        {info}
                      </Alert>
                    )}

                    <div className="d-flex justify-content-between align-items-center mb-3 mt-2">
                      <button
                        type="button"
                        className="btn btn-link p-0 small"
                        onClick={() => setShowForgot(true)}
                      >
                        Forgot password?
                      </button>
                      <span className="small text-muted">Secure login</span>
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-100 py-3 fw-semibold"
                      style={{
                        borderRadius: "12px",
                        background:
                          "linear-gradient(45deg, var(--primary-blue), #0056b3)",
                        border: "none",
                      }}
                    >
                      {isLoading ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Logging in...
                        </>
                      ) : (
                        "Login"
                      )}
                    </Button>
                  </Form>
                )}

                {showForgot && !otpRequired && (
                  <div>
                    <div className="mb-2">
                      <button
                        type="button"
                        className="btn btn-link p-0 small"
                        onClick={() => setShowForgot(false)}
                      >
                        &larr; Back to login
                      </button>
                    </div>
                    <ForgotPasswordUser />
                  </div>
                )}

                {otpRequired && !showForgot && (
                  <Form onSubmit={handleVerifyOtp}>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">Enter OTP</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="6-digit code"
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        required
                        className="py-3"
                        style={{ borderRadius: "12px" }}
                        inputMode="numeric"
                        pattern="\d{6}"
                      />
                    </Form.Group>

                    {error && (
                      <Alert
                        variant={/expired/i.test(error) ? "warning" : "danger"}
                        className="mb-3"
                      >
                        {error}
                      </Alert>
                    )}
                    {info && (
                      <Alert variant="info" className="mb-3">
                        {info}
                      </Alert>
                    )}

                    <div className="d-flex gap-2">
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-100 py-3 fw-semibold"
                        style={{
                          borderRadius: "12px",
                          background:
                            "linear-gradient(45deg, var(--primary-blue), #0056b3)",
                          border: "none",
                        }}
                      >
                        {isLoading ? "Verifying..." : "Verify OTP"}
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0}
                        className="py-3 fw-semibold"
                        style={{ borderRadius: "12px" }}
                      >
                        {resendCooldown > 0
                          ? `Resend in ${formatTime(resendCooldown)}`
                          : "Resend OTP"}
                      </Button>
                    </div>
                  </Form>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default LoginPage;
