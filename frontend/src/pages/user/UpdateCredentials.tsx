import { useState } from "react";
import {
  TextField,
  Button,
  Container,
  Typography,
  Card,
  CardContent,
  Box,
} from "@mui/material";
import axios from "axios";
import Swal from "sweetalert2";
import { useNavigate, useParams } from "react-router-dom";

export default function UpdateCredentials() {
  const { id } = useParams();
  const [credentials, setCredentials] = useState({
    username: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleUpdate = async () => {
    if (credentials.newPassword !== credentials.confirmPassword) {
      Swal.fire({
        icon: "warning",
        title: "Passwords do not match",
        text: "Please re-enter matching passwords.",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.put(
        `https://eduvision-dura.onrender.com/api/auth/update-credentials/${id}`,
        {
          username: credentials.username,
          password: credentials.newPassword,
          status: "active",
        }
      );

      const role = response.data.role;

      Swal.fire({
        icon: "success",
        title: "Updated!",
        text: "Your credentials have been updated successfully.",
      });

      // Navigate based on the role
      if (role === "dean") {
        navigate(`/dean-dashboard/${id}`);
      } else if (role === "instructor") {
        navigate(`/faculty-dashboard/${id}`);
      } else if (role === "programchairperson") {
        navigate(`/dashboard/${id}`);
      } else {
        navigate("/"); // Fallback
      }
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: error.response?.data?.message || "Could not update credentials.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      maxWidth="xs"
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <Card
        elevation={3}
        sx={{ padding: 3, width: "100%", textAlign: "center" }}
      >
        <CardContent>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Update Your Credentials
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Please set a new username and password to continue.
          </Typography>
          <Box component="form" sx={{ mt: 2 }}>
            <TextField
              label="New Username"
              name="username"
              fullWidth
              margin="normal"
              variant="outlined"
              onChange={handleChange}
            />
            <TextField
              label="New Password"
              name="newPassword"
              type="password"
              fullWidth
              margin="normal"
              variant="outlined"
              onChange={handleChange}
            />
            <TextField
              label="Confirm Password"
              name="confirmPassword"
              type="password"
              fullWidth
              margin="normal"
              variant="outlined"
              onChange={handleChange}
            />
            <Button
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 2, py: 1.2 }}
              onClick={handleUpdate}
              disabled={loading}
            >
              {loading ? "Updating..." : "Update"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
