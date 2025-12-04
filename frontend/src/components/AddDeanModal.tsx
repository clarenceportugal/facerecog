import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Typography,
  TextField,
  Divider,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { SelectChangeEvent } from "@mui/material";

interface AddDeanModalProps {
  openModal: boolean;
  handleCloseModal: () => void;
  handleAddAccount: () => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleRoleChange: (e: SelectChangeEvent) => void;
  togglePasswordVisibility: () => void;
  showPassword: boolean;
  newFaculty: any;
  setNewFaculty: React.Dispatch<React.SetStateAction<any>>;
  colleges: { code: string }[];
  fetchCoursesByCollege: (collegeCode: string) => void;
}

const AddDeanModal: React.FC<AddDeanModalProps> = ({
  openModal,
  handleCloseModal,
  handleAddAccount,
  handleInputChange,
  handleRoleChange,
  togglePasswordVisibility,
  showPassword,
  newFaculty,
  setNewFaculty,
  colleges,
  fetchCoursesByCollege,
}) => {
  return (
    <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
      <DialogTitle>Add Faculty Account</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} mt={1}>
          {/* Personal Info */}
          <Grid item xs={12} sm={5}>
            <Typography variant="subtitle1" gutterBottom>
              Personal Info
            </Typography>
            <TextField
              fullWidth
              label="Last Name"
              name="last_name"
              value={newFaculty.last_name}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="First Name"
              name="first_name"
              value={newFaculty.first_name}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="Middle Name"
              name="middle_name"
              value={newFaculty.middle_name}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="Extension Name"
              name="ext_name"
              value={newFaculty.ext_name}
              onChange={handleInputChange}
              margin="dense"
            />
            <Autocomplete
              options={colleges.map((college) => college.code)}
              value={newFaculty.college || ""}
              onChange={(_, newValue) => {
                setNewFaculty((prev: any) => ({
                  ...prev,
                  college: newValue || "",
                  course: "",
                }));
                if (newValue) fetchCoursesByCollege(newValue);
              }}
              renderInput={(params) => (
                <TextField {...params} label="College" margin="dense" fullWidth />
              )}
              freeSolo
              disableClearable
            />
          </Grid>

          {/* Divider */}
          <Grid
            item
            xs={12}
            sm={2}
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "stretch",
            }}
          >
            <Divider orientation="vertical" flexItem />
          </Grid>

          {/* Account Credentials */}
          <Grid item xs={12} sm={5}>
            <Typography variant="subtitle1" gutterBottom>
              Account Credentials
            </Typography>
            <TextField
              fullWidth
              label="Username"
              name="username"
              value={newFaculty.username}
              onChange={handleInputChange}
              margin="dense"
              InputProps={{ readOnly: true }}
            />
            <TextField
              fullWidth
              label="Email"
              name="email"
              value={newFaculty.email}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={newFaculty.password}
              onChange={handleInputChange}
              margin="dense"
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={togglePasswordVisibility} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <FormControl fullWidth margin="dense">
              <InputLabel>Role</InputLabel>
              <Select name="role" value={newFaculty.role} onChange={handleRoleChange} disabled>
                <MenuItem value="dean">Dean</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCloseModal}>Cancel</Button>
        <Button onClick={handleAddAccount} variant="contained" color="primary">
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddDeanModal;
