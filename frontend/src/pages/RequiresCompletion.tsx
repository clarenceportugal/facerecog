import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Grid,
  Button,
  Fade,
} from "@mui/material";
import axios from "axios";
import Swal from 'sweetalert2';
import { useNavigate } from "react-router-dom";
import AdminHeader from "../components/AdminHeader";


const steps = ["Personal Information", "Account Credentials", "Academic & Appointment Details", "Confirmation"];

const RequiresCompletion: React.FC = () => {
  const [formData, setFormData] = useState({
    lastName: "",
    firstName: "",
    extensionName: "",
    middleName: "",
    college: "",
    course: "",
    username: "",
    email: "",
    password: "",
    role: "",
    education: "",
    rank: "",
    appointment: "",
    preparations: "",
    teachingLoad: "",
  });
  const [activeStep, setActiveStep] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const navigate = useNavigate();

 const handleNext = async () => {
  setFadeIn(false);
  setTimeout(async () => {
    if (activeStep === steps.length - 1) {
      try {
        Swal.fire({
          title: 'Saving Information...',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
        const response = await axios.post(`${API_BASE_URL}/api/accountcompletion/save-user-info`, formData);
        console.log(response);

        const userId = response.data?.userId;
        const collegeCode = response.data?.collegeCode;
        const courseCode = response.data?.courseCode;
        const role = formData.role;

        if (userId) {
          localStorage.setItem("userId", userId);
        }
        if (collegeCode) {
          localStorage.setItem("college", collegeCode);
        }
        if (courseCode) {
          localStorage.setItem("course", courseCode);
        }

        Swal.fire({
          icon: 'success',
          title: 'Registration Complete',
          text: 'Your account has been successfully registered!',
          confirmButtonColor: '#2e7d32',
          timer: 3000,
          timerProgressBar: true,
          showConfirmButton: false,
          didClose: () => {
            if (role === "dean") {
              navigate(`/dean-dashboard/${userId}`);
            } else if (role === "programchairperson") {
              navigate(`/dashboard/${userId}`);
            } else if (role === "instructor") {
              navigate(`/faculty-dashboard/${userId}`);
            }
          }
        });


      } catch (error) {
        console.error("Failed to save user info:", error);
        Swal.fire({
          icon: 'error',
          title: 'Submission Failed',
          text: 'Please fill out all necessary fields.',
          confirmButtonColor: '#c62828',
        });
      }
    } else {
      setActiveStep((prev) => prev + 1);
    }
    setFadeIn(true);
  }, 200);
};



  const handleBack = () => {
    setFadeIn(false);
    setTimeout(() => {
      setActiveStep((prev) => Math.max(prev - 1, 0));
      setFadeIn(true);
    }, 200);
  };

  useEffect(() => {
  const userId = localStorage.getItem("userId");

  if (userId) {
    axios.post("https://eduvision-dura.onrender.com/api/accountcompletion/temp-account-info", { userId })
      .then(response => {
        console.log("Response from backend:", response.data);
        setFormData((prev) => ({
          ...prev,
          college: response.data.data?.department?.code || "",
          course: response.data.data?.program?.code || "",
          email: response.data.data?.email || "",
          role: response.data.data?.role || "",
        }));
      })
      .catch(error => {
        console.error("Error sending userId:", error);
      });
  } else {
    console.warn("No userId found in localStorage");
  }

  // ✅ Add unload warning
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = ""; // Required for Chrome to show the confirmation dialog
  };

  window.addEventListener("beforeunload", handleBeforeUnload);

  // Cleanup
  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}, []);


  return (
    <Box 
      display="flex" 
      flexDirection="column"
      alignItems="center" 
      bgcolor="#f5f5f5"
      minHeight="100vh"
      py={4}
    >
      <AdminHeader/>
      <Box sx={{ mt: { xs: 8, sm: 10 }, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: '100%', maxWidth: 600, px: 2 }}>
          <Paper elevation={4} sx={{ p: 4, width: 500, borderRadius: 3 }}>
          {/* Stepper */}
          <Stepper
            activeStep={activeStep}
            alternativeLabel
            sx={{
              mb: 4,
              "& .MuiStep-root": {
                px: 3,
              },
              "& .MuiStepIcon-root": {
                color: "#c62828",
                fontSize: "2rem",
                width: 30,
                height: 30,
                zIndex: 1,
                "&.Mui-completed": { color: "#2e7d32" },
                "&.Mui-active": { color: "#2e7d32" },
              },
              "& .MuiStepConnector-root": {
                top: 14,
              },
              "& .MuiStepConnector-line": {
                borderColor: "#bdbdbd",
                borderTopWidth: 1,
              },
              "& .MuiStepLabel-label": {
                fontSize: "0.875rem",
                mt: 1.5,
              },
            }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Fade Animated Step Content */}
          <Fade in={fadeIn} timeout={300}>
            <Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom color="#2e7d32">
                {steps[activeStep]}
              </Typography>

              <Grid container spacing={2}>
                {activeStep === 0 && (
                <>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Last Name" 
                      variant="outlined"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} 
                    />
                  </Grid>
                  <Grid item container spacing={2} xs={12}>
                    <Grid item xs={9}>
                      <TextField 
                        fullWidth 
                        label="First Name" 
                        variant="outlined"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      />
                    </Grid>
                    <Grid item xs={3}>
                      <TextField 
                        fullWidth 
                        label="Ext. Name" 
                        variant="outlined"
                        value={formData.extensionName}
                        onChange={(e) => setFormData({ ...formData, extensionName: e.target.value })}
                      />
                    </Grid>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Middle Name" 
                      variant="outlined"
                      value={formData.middleName}
                      onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField 
                      fullWidth 
                      label="College" 
                      variant="outlined"
                      value={formData.college}
                      InputProps={{ readOnly: true, style: { backgroundColor: "#f0f0f0" } }}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField 
                      fullWidth 
                      label="Course" 
                      variant="outlined"
                      value={formData.course}
                      InputProps={{
                        readOnly: true,
                        sx: {
                          '& input': {
                            textTransform: 'uppercase',
                          },
                          backgroundColor: '#f0f0f0',
                        },
                      }}
                    />
                  </Grid>
                </>
              )}

              {activeStep === 1 && (
                <>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Username" 
                      variant="outlined"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Email" 
                      type="email" 
                      variant="outlined"
                      value={formData.email}
                      InputProps={{ readOnly: true, style: { backgroundColor: "#f0f0f0" } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Password" 
                      type="password" 
                      variant="outlined"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Role" 
                      variant="outlined"
                      value={formData.role}
                      InputProps={{ readOnly: true, style: { backgroundColor: "#f0f0f0" } }}
                    />
                  </Grid>
                </>
              )}

              {activeStep === 2 && (
                <>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Highest Educational Attainment"
                      variant="outlined"
                      value={formData.education}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Academic Rank"
                      variant="outlined"
                      value={formData.rank}
                      onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Status of Appointment"
                      variant="outlined"
                      value={formData.appointment}
                      onChange={(e) => setFormData({ ...formData, appointment: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Number of Preparations"
                      type="number"
                      inputProps={{ min: 0, step: "any" }}
                      variant="outlined"
                      value={formData.preparations}
                      onChange={(e) => setFormData({ ...formData, preparations: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Total Teaching Load"
                      type="number"
                      inputProps={{ min: 0, step: "any" }}
                      variant="outlined"
                      value={formData.teachingLoad}
                      onChange={(e) => setFormData({ ...formData, teachingLoad: e.target.value })}
                    />
                  </Grid>
                </>
              )}

              {activeStep === 3 && (
                <Paper elevation={3} sx={{ p: { xs: 2, sm: 3 }, width: '100%', mt: 3 }}>
                  <Typography
                    variant="h6"
                    gutterBottom
                    fontWeight="bold"
                    color="primary"
                    sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                  >
                    Review Information
                  </Typography>

                  <Grid container spacing={3}>
                    {/* Row 1: Name + Rank */}
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                        <Typography variant="body1">
                          <strong>Name:</strong> {formData.lastName}, {formData.firstName} {formData.middleName} {formData.extensionName}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                        <Typography variant="body1">
                          <strong>Academic Rank:</strong> {formData.rank}
                        </Typography>
                      </Box>
                    </Grid>

                    {/* Row 2: College & Course */}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>College:</strong> {formData.college}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Course:</strong> {formData.course}
                      </Typography>
                    </Grid>

                    {/* Row 3: Account Credentials (without password) */}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Username:</strong> {formData.username}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Role:</strong> {formData.role}
                        
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Email:</strong> {formData.email}
                      </Typography>
                    </Grid>

                    {/* Row 4: Appointment Details (education, preparations, load) */}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Highest Educational Attainment:</strong> {formData.education}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Preparations:</strong> {formData.preparations}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Teaching Load:</strong> {formData.teachingLoad}
                      </Typography>
                    </Grid>

                    {/* Status of Appointment moved to bottom */}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        <strong>Status of Appointment:</strong> {formData.appointment}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              )}
              </Grid>

              {/* Navigation Buttons */}
              <Box display="flex" justifyContent="space-between" mt={4}>
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: "#c62828",
                    "&:hover": { backgroundColor: "#b71c1c" },
                    color: "#fff",
                  }}
                  onClick={handleBack}
                  disabled={activeStep === 0}
                >
                  Previous
                </Button>

                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: "#2e7d32",
                    "&:hover": { backgroundColor: "#1b5e20" },
                    color: "#fff",
                  }}
                  onClick={handleNext}
                >
                  {activeStep === steps.length - 1 ? "Finish" : "Next"}
                </Button>
              </Box>
            </Box>
          </Fade>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};

export default RequiresCompletion;
