import { useState, useEffect } from "react";
import {
  TextField,
  Button,
  Container,
  Typography,
  Card,
  Box,
  Grid,
  IconButton,
  Avatar,
  MenuItem,
  FormControl,
  InputLabel,
  Select
} from "@mui/material";
import axios from "axios";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PhotoCamera from "@mui/icons-material/PhotoCamera";


interface College {
  _id: string;
  code: string;
  name: string;
}

export default function AuthPage() {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [colleges, setColleges] = useState<College[]>([]);
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<any[]>([]);


  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [selectedCollegeCode, setSelectedCollegeCode] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const response = await axios.get("https://eduvision-dura.onrender.com/api/loginsignup/colleges");
        setColleges(response.data);
      } catch (error) {
        console.error("Failed to fetch colleges:", error);
      }
    };

    fetchColleges();
  }, []);

  const handleCollegeChange = async (code: string) => {
  setSelectedCollegeCode(code);
  console.log(code)

  try {
    const res = await axios.post("https://eduvision-dura.onrender.com/api/loginsignup/selected-college", {
      collegeCode: code,
    });
    console.log("Programs:", res.data);
    setPrograms(res.data)
  } catch (error) {
    console.error("Failed to send selected college code:", error);
  }
};

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      Swal.fire({
        icon: 'warning',
        title: 'File Too Large',
        text: 'Please upload a photo smaller than 10MB.',
      });
      event.target.value = "";
      return;
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleCheckAccountStatus = async () => {
  const { value: email } = await Swal.fire({
    title: "Check Account Status",
    input: "email",
    inputLabel: "Enter your email address",
    inputPlaceholder: "you@example.com",
    showCancelButton: true,
    confirmButtonText: "Submit",
    cancelButtonText: "Cancel",
    inputValidator: (value) => {
      if (!value) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email format";
      return null;
    },
    background: "#f5f3f4",
    color: "#161A1D",
    confirmButtonColor: "#BA181B",
    cancelButtonColor: "#b1a7a6",
    customClass: {
      popup: "swal2-border-radius",
      title: "swal2-title-custom",
      input: "swal2-input-custom",
    },
  });

  if (email) {
    try {
      const res = await fetch("https://eduvision-dura.onrender.com/api/loginsignup/check-temp-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.success) {
        Swal.fire({
          icon: "success",
          title: "Email Found",
          text: `An account with the email ${email} is pending approval. Please wait for admin confirmation.`,

          background: "#f5f3f4",
          color: "#161A1D",
          confirmButtonColor: "#BA181B",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Not Found",
          text: data.message,
          background: "#f5f3f4",
          color: "#161A1D",
          confirmButtonColor: "#BA181B",
        });
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire({
        icon: "error",
        title: "Server Error",
        text: "Something went wrong while checking the email.",
        background: "#f5f3f4",
        color: "#161A1D",
        confirmButtonColor: "#BA181B",
      });
    }
  }
};

  const handleSignUp = async () => {
    if (!email || !role || !selectedCollegeCode || (!selectedProgram && role !== 'dean') || !imageFile) {
      Swal.fire({
        icon: "warning",
        title: "Missing Information",
        text: "Please complete all required fields before signing up.",
      });
      return;
    }

    try {
      Swal.fire({
        title: "Sending Verification Code...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      await axios.post("https://eduvision-dura.onrender.com/api/loginsignup/send-verification-code", { email });

      Swal.close();

      const { value: verificationCode } = await Swal.fire({
        title: "Enter Verification Code",
        input: "text",
        inputLabel: `A verification code was sent to ${email}`,
        inputPlaceholder: "Enter the code here",
        showCancelButton: true,
        confirmButtonText: "Verify",
        showLoaderOnConfirm: true,
        preConfirm: async (code) => {
          if (!code) {
            Swal.showValidationMessage("You need to enter the verification code!");
            return false;
          }
          try {
            const res = await axios.post("https://eduvision-dura.onrender.com/api/loginsignup/verify-code", {
              email,
              code,
            });

            if (!res.data.success) {
              throw new Error("Verification failed");
            }
            console.log("Verification code is correct:", code);

            return code; 

          } catch (err) {
            Swal.showValidationMessage("Invalid or expired code.");
            return false;
          }
        },
        allowOutsideClick: () => !Swal.isLoading(),
      });

      if (!verificationCode) return;

      // ✅ Step 3: Show loading for actual signup process
      Swal.fire({
        title: "Creating Account...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const formData = new FormData();
      formData.append("email", email);
      formData.append("role", role);
      formData.append("department", selectedCollegeCode);
      formData.append("program", selectedProgram);
      formData.append("photo", imageFile);

      const response = await axios.post("https://eduvision-dura.onrender.com/api/loginsignup/signup", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      // ✅ Close loading and show success
      Swal.close();
      Swal.fire({
        icon: "success",
        title: "Initial Account Created",
        text: "Thanks for signing up! Your account is pending approval.",
      });

      console.log("Signup success:", response.data);
      Swal.fire({
        icon: "success",
        title: "Initial Account Created",
        text: "Thanks for signing up! Your account is pending approval.",
      });

      setEmail("");
      setRole("");
      setSelectedCollegeCode("");
      setSelectedProgram("");
      setImageFile(null);
      setPreview(null);

      } catch (error) {
        Swal.close();
        let message = "An error occurred while signing up.";

        if (axios.isAxiosError(error)) {
          if (error.response) {
            message = error.response.data?.message || message;
            console.error("Signup failed with response:", {
              status: error.response.status,
              data: error.response.data,
            });
          } else if (error.request) {
            message = "No response from server. Please check your connection.";
            console.error("Signup failed, no response received:", error.request);
          } else {
            message = error.message;
            console.error("Signup error:", message);
          }
        } else if (error instanceof Error) {
          message = error.message;
          console.error("Signup error:", message);
        } else {
          console.error("Signup failed with unknown error:", error);
        }

        Swal.fire({
          icon: "error",
          title: "Signup Failed",
          text: message,
        });
      }
  };

  const handleSubmit = async () => {
  if (!isLogin) return;

  setLoading(true);
  try {
    const res = await axios.post(
      "https://eduvision-dura.onrender.com/api/loginsignup/login",
      credentials
    );
    const { token, user, requiresUpdate, requiresCompletion } = res.data;

    localStorage.setItem("token", token);
    localStorage.setItem("userId", user.id);

    if (user.course) {
      localStorage.setItem("course", user.course);
    }

    if (user.college) {
      if (typeof user.college === "object" && user.college.code) {
        localStorage.setItem("college", user.college.code);
      } else {
        localStorage.setItem("college", user.college);
      }
    }

    Swal.fire({
      icon: "success",
      title: `Welcome ${user.last_name}, ${user.first_name} ${user.middle_name || ""}`.trim(),
      showConfirmButton: false,
      timer: 2000,
    });

    if (requiresUpdate) {
      navigate(`/update-credentials/${user.id}`);
    } else if (requiresCompletion) {
      navigate(`/requires-completion/${user.id}`);
    } else if (user.role?.toLowerCase() === "superadmin") {
      navigate(`/superadmin-dashboard/${user.id}`);
    } else if (user.role?.toLowerCase() === "dean") {
      navigate(`/dean-dashboard/${user.id}`);
    } else if (
      user.role?.toLowerCase() === "instructor" &&
      user.status?.toLowerCase() === "active"
    ) {
      navigate(`/faculty-dashboard/${user.id}`);
    } else if (user.role?.toLowerCase() === "programchairperson") {
      navigate(`/dashboard/${user.id}`);
    }
  } catch (error) {
    let errorMessage = "Error";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || "Invalid Credentials";
    }
    Swal.fire({
      icon: "error",
      title: "Oops...",
      text: errorMessage,
      confirmButtonColor: "steelblue",
    });
  } finally {
    setLoading(false);
  }
};


  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: '100%',
        backgroundColor: "black",
        backgroundImage: 'url("/CNSCBG.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 1,
        },
      }}
    >
      <Container maxWidth="md" sx={{ position: "relative", zIndex: 2 }}>
      <Card
        elevation={6}
        sx={{
          width: "100%",
          maxWidth: 900,
          borderRadius: "20px",
          overflow: "hidden",
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(6px)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}
      >

          <Grid container>
            {/* LEFT PANEL */}
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                background: isLogin
                  ? "linear-gradient(135deg, #660708, #A4161A)"
                  : "linear-gradient(135deg, #f0e3d8, #ECDCBF)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "stretch",
                padding: 4,
                color: isLogin ? "white" : "#333",
                minHeight: { xs: 500, md: 600 },
              }}
            >

              <AnimatePresence mode="wait">
                {isLogin ? (
                  <motion.div
                    key="login-left"
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ duration: 0.4 }}
                    style={{ 
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "24px",
                    }}
                  >
                    <img
                      src="/EduVisionLogo.png"
                      alt="EduVision Logo"
                      style={{
                        height: 140,
                        objectFit: "contain",
                        borderRadius: 40,
                      }}
                    />
                    
                    <Typography variant="h5" sx={{ color: "white" }}>
                      Join us and manage your faculty schedules efficiently.
                    </Typography>
                  </motion.div>


                ) : (
                  <motion.div
                    key="signup-left"
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="h4" fontWeight="bold">
                        Sign Up
                      </Typography>
                      <Typography variant="body2" color="gray" sx={{ mb: 1 }}>
                        Create your account here.
                      </Typography>

                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        sx={{ mb: 3 }}
                      >
                        <Avatar
                          src={preview || ""}
                          alt="Profile"
                          sx={{ width: 80, height: 80, mb: 1.5 }}
                        />
                        <input
                          accept="image/*"
                          id="upload-photo"
                          type="file"
                          style={{ display: "none" }}
                          onChange={handleImageChange}
                        />
                        <label htmlFor="upload-photo">
                          <IconButton
                            color="primary"
                            aria-label="upload picture"
                            component="span"
                            sx={{
                              backgroundColor: "#e0e0e0",
                              ":hover": { backgroundColor: "#d0d0d0" },
                              px: 2,
                              py: 1,
                              borderRadius: 2,
                              fontSize: 14,
                            }}
                          >
                            <PhotoCamera sx={{ mr: 1 }} />
                            Upload Photo
                          </IconButton>
                        </label>
                      </Box>

                      <TextField
                        label="Email"
                        fullWidth
                        sx={{ mb: 2 }}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <TextField
                        select
                        label="Role"
                        fullWidth
                        sx={{ mb: 2 }}
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <MenuItem value="dean">Dean</MenuItem>
                        <MenuItem value="programchairperson">Program Chairperson</MenuItem>
                        <MenuItem value="instructor">Instructor</MenuItem>
                      </TextField>
                      <Box display="flex" gap={2} sx={{ mb: 1 }}>
                        <FormControl fullWidth sx={{ mb: 1 }}>
                          <InputLabel id="college-select-label">Department</InputLabel>
                          <Select
                            labelId="college-select-label"
                            value={selectedCollegeCode}
                            label="Department"
                            onChange={(e) => {
                              const code = e.target.value;
                              setSelectedCollegeCode(code);
                              setSelectedProgram("");
                              handleCollegeChange(code);
                            }}
                            renderValue={(selected) => selected}
                          >
                            {colleges.map((college) => (
                              <MenuItem key={college._id} value={college.code}>
                                ({college.code}) - {college.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl fullWidth sx={{ mb: 1 }}>
                          <InputLabel id="program-select-label">Program</InputLabel>
                          <Select
                            labelId="program-select-label"
                            value={selectedProgram}
                            label="Program"
                            onChange={(e) => setSelectedProgram(e.target.value.toLowerCase())}
                            renderValue={(selected) => selected.toUpperCase()}
                            disabled={role === "dean" || programs.length === 0}
                          >
                            {programs.map((program) => (
                              <MenuItem key={program._id} value={program.code.toLowerCase()}>
                                ({program.code.toUpperCase()}) {program.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>

                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleSignUp}
                        sx={{
                          py: 1.2,
                          backgroundColor: "#5a0000",
                          '&:hover': { backgroundColor: "#730000" },
                          mb: 1,
                        }}
                      >
                        Sign Up
                      </Button>

                      <Typography variant="body2" sx={{ color: "black" }}>
                        Already have an account?{" "}
                        <Typography
                          component="span"
                          onClick={() => setIsLogin(true)}
                          sx={{
                            color: "#5a0000",
                            textTransform: "none",
                            cursor: "pointer",
                            display: "inline",
                            position: "relative",
                            "&::after": {
                              content: '""',
                              position: "absolute",
                              width: "0%",
                              height: "2px",
                              left: 0,
                              bottom: 0,
                              backgroundColor: "#5a0000",
                              transition: "width 0.3s ease",
                            },
                            "&:hover::after": {
                              width: "100%",
                            },
                          }}
                        >
                          Login
                        </Typography>
                      </Typography>
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>

            </Grid>

            {/* RIGHT PANEL */}
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                background: isLogin
                  ? "linear-gradient(135deg, #f0e3d8, #ECDCBF)"
                  : "linear-gradient(135deg, #660708, #A4161A)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: 4,
                color: isLogin ? "#333" : "white",
                minHeight: { xs: 500, md: 600 },
              }}
            >
              <AnimatePresence mode="wait">
                {isLogin ? (
                  <motion.div
                    key="login-right"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Box width="100%" maxWidth={350}>
                      <Typography variant="h4" fontWeight="bold" gutterBottom>
                        Log In
                      </Typography>
                      <Typography variant="body2" color="gray" gutterBottom>
                        Please enter your credentials to sign in
                      </Typography>
                      <TextField
                        label="Email or Username"
                        name="usernameOrEmail"
                        fullWidth
                        margin="normal"
                        variant="outlined"
                        onChange={handleChange}
                        InputLabelProps={{ style: { color: "black" } }}
                        InputProps={{ style: { color: "black" } }}
                        sx={{ mt: 2 }}
                      />
                      <TextField
                        label="Password"
                        name="password"
                        type="password"
                        fullWidth
                        margin="normal"
                        variant="outlined"
                        onChange={handleChange}
                        InputLabelProps={{ style: { color: "black" } }}
                        InputProps={{ style: { color: "black" } }}
                      />
                      <Button
                        variant="contained"
                        fullWidth
                        sx={{
                          mt: 2,
                          py: 1.2,
                          backgroundColor: "#5a0000",
                          '&:hover': { backgroundColor: "#730000" },
                        }}
                        onClick={handleSubmit}
                        disabled={loading}
                      >
                        {loading ? "Logging in..." : "Login"}
                      </Button>
                      <Typography variant="body2" sx={{ mt: 2, color: "black" }}>
                        Don't have an account?{" "}
                        <Typography
                          component="span"
                          onClick={() => setIsLogin(false)}
                          sx={{
                            color: "#5a0000",
                            textTransform: "none",
                            cursor: "pointer",
                            display: "inline",
                            position: "relative",
                            "&::after": {
                              content: '""',
                              position: "absolute",
                              width: "0%",
                              height: "2px",
                              left: 0,
                              bottom: 0,
                              backgroundColor: "#5a0000",
                              transition: "width 0.3s ease",
                            },
                            "&:hover::after": {
                              width: "100%",
                            },
                          }}
                        >
                          Sign up
                        </Typography>
                      </Typography>
                    </Box>
                  </motion.div>
                ) : (
                  <motion.div
                    key="signup-right"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.4 }}
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <Box
                      sx={{
                        flexGrow: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        px: 2,
                      }}
                    >
                      <img
                        src="/EduVisionLogo.png"
                        alt="EduVision Logo"
                        style={{
                          height: 140,
                          objectFit: "contain",
                          borderRadius: 40,
                        }}
                      />
                      <Typography 
                        variant="h5" 
                        sx={{ color: "white", mt: 3, textAlign: "center" }}
                      >
                        Connect, manage, and track with confidence.
                      </Typography>
                    </Box>

                    <Box
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      sx={{ mb: 3 }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ color: "white", fontSize: "0.8rem" }}
                      >
                        Do you want to check the status of your account?{" "}
                        <Button
                          variant="text"
                          onClick={handleCheckAccountStatus}
                          sx={{
                            color: "white",
                            padding: 0,
                            minWidth: "unset",
                            textTransform: "none",
                            fontWeight: "inherit",
                            fontFamily: "inherit",
                            fontSize: "inherit",
                            lineHeight: "inherit",
                            borderBottom: "2px solid white",
                            cursor: "pointer",
                            "&:hover": {
                              backgroundColor: "transparent",
                              borderBottom: "2px solid white",
                            },
                          }}
                        >
                          Click here
                        </Button>
                      </Typography>
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>
            </Grid>
          </Grid>
        </Card>
      </Container>
    </Box>
  );
}
