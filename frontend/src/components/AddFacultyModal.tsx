import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Typography,
  Divider,
  InputAdornment,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import React from "react";

interface AddFacultyModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
  newFaculty: any;
  setNewFaculty: (val: any) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRoleChange: (e: any) => void;
  showPassword: boolean;
  togglePasswordVisibility: () => void;
}

const AddFacultyModal: React.FC<AddFacultyModalProps> = ({
  open,
  onClose,
  onAdd,
  newFaculty,
  setNewFaculty,
  handleInputChange,
  handleRoleChange,
  showPassword,
  togglePasswordVisibility,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Add Faculty Account</DialogTitle>
      <DialogContent>
        <Grid container spacing={1}>
          <Grid item xs={12} sm={3}>
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
              label="College"
              value={newFaculty.college}
              disabled
              margin="dense"
            />
            <TextField
              fullWidth
              label="Course"
              value={newFaculty.course}
              disabled
              margin="dense"
              InputProps={{
                readOnly: true,
                sx: {
                  "& input.Mui-disabled": {
                    textTransform: "uppercase",
                    WebkitTextFillColor: "unset",
                  },
                },
              }}
            />
          </Grid>

          <Grid item sm={1} sx={{ display: "flex", justifyContent: "center" }}>
            <Divider orientation="vertical" flexItem />
          </Grid>

          <Grid item xs={12} sm={3}>
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
              <Select
                name="role"
                value={newFaculty.role}
                onChange={handleRoleChange}
                disabled
              >
                <MenuItem value="instructor">Instructor</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item sm={1} sx={{ display: "flex", justifyContent: "center" }}>
            <Divider orientation="vertical" flexItem />
          </Grid>

          <Grid item xs={12} sm={3}>
            <Typography variant="subtitle1" gutterBottom>
              Optional
            </Typography>
            <TextField
              fullWidth
              label="Highest Educational Attainment"
              name="highestEducationalAttainment"
              value={newFaculty.highestEducationalAttainment}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="Academic Rank"
              name="academicRank"
              value={newFaculty.academicRank}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="Status of Appointment"
              name="statusOfAppointment"
              value={newFaculty.statusOfAppointment}
              onChange={handleInputChange}
              margin="dense"
            />
            <TextField
              fullWidth
              label="Number of Preparations"
              type="number"
              inputProps={{ min: 0, step: "any" }}
              value={newFaculty.numberOfPrep}
              onChange={(e) =>
                setNewFaculty({
                  ...newFaculty,
                  numberOfPrep: parseFloat(e.target.value),
                })
              }
              margin="dense"
            />
            <TextField
              fullWidth
              label="Total Teaching Load"
              type="number"
              inputProps={{ min: 0, step: "any" }}
              value={newFaculty.totalTeachingLoad}
              onChange={(e) =>
                setNewFaculty({
                  ...newFaculty,
                  totalTeachingLoad: parseFloat(e.target.value),
                })
              }
              margin="dense"
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} variant="contained" color="primary">
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddFacultyModal;
