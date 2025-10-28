//AddManualScheduleModal.tsx
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Checkbox,
  FormControlLabel,
  Autocomplete,
} from "@mui/material";
import axios from "axios";
import Swal from "sweetalert2";

interface AddManualScheduleProps {
  open: boolean;
  onClose: () => void;
  faculty: any;
}

export interface Subject {
  _id: string;
  courseCode: string;
  courseTitle: string;
}

interface Room {
  _id: string;
  name: string;
}

interface Section {
  _id: string;
  course: string;
  section: string;
  block: string;
}

interface Semester {
  semesterName: "1ST" | "2ND" | "MIDYEAR";
  academicYear: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

const AddManualSchedule: React.FC<AddManualScheduleProps> = ({
  open,
  onClose,
  faculty,
}) => {
  const [formData, setFormData] = useState({
    courseTitle: "",
    courseCode: "",
    instructor: faculty?._id || "",
    room: "",
    startTime: "",
    endTime: "",
    days: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
    },
    semesterStartDate: "",
    semesterEndDate: "",
    section: "",
  });
  const handleClose = () => {
    // Reset days to all false
    setFormData((prev) => ({
      ...prev,
      days: {
        mon: false,
        tue: false,
        wed: false,
        thu: false,
        fri: false,
        sat: false,
      },
    }));

    // Call the original onClose prop
    onClose();
  };

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      days: { ...prev.days, [name]: checked },
    }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const res = await axios.post(
        "http://localhost:5000/api/auth/add-schedules",
        formData
      );
      console.log("Schedule created:", res.data);

      Swal.fire({
        icon: "success",
        title: "Success",
        text: "Schedule created successfully!",
        timer: 2000,
        showConfirmButton: false,
      });

      onClose();
    } catch (error) {
      console.error("Failed to create schedule", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to create schedule. Please try again.",
      });
    } finally {
      setLoading(false); // stop loading
    }
  };


  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = await axios.get<Subject[]>(
          "https://eduvision-dura.onrender.com/api/auth/subjects"
        );
        setSubjects(res.data);
      } catch (err) {
        console.error("Failed to fetch subjects", err);
      }
    };

    fetchSubjects();
  }, []);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await axios.get<Room[]>(
          "https://eduvision-dura.onrender.com/api/auth/rooms"
        );
        setRooms(res.data);
      } catch (error) {
        console.error("Failed to fetch rooms", error);
      }
    };

    fetchRooms();
  }, []);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await axios.get<Section[]>(
          "https://eduvision-dura.onrender.com/api/auth/sections"
        );
        setSections(res.data);
      } catch (error) {
        console.error("Failed to fetch sections", error);
      }
    };

    fetchSections();
  }, []);

  useEffect(() => {
  const fetchSemesters = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/auth/all-semesters");

      // ✅ Extract semester data
      const data = res.data.data || [];

      // ✅ Find the active semester
      const activeSemester = data.find((s: any) => s.isActive);

      setSemesters(data);

      // ✅ Automatically set the form to the active semester
      if (activeSemester) {
        setFormData((prev) => ({
          ...prev,
          semesterStartDate: activeSemester.startDate || "",
          semesterEndDate: activeSemester.endDate || "",
        }));

        // ✅ Also set the default value in the UI
        setSelectedSemester(activeSemester);
      }
    } catch (error) {
      console.error("Error fetching semesters:", error);
    }
  };

  fetchSemesters();
}, []);

// ✅ Local state for the selected semester
const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);


  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Manual Schedule</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Autocomplete
              options={subjects}
              getOptionLabel={(option) =>
                `${option.courseCode} - ${option.courseTitle}`
              }
              onChange={(_, value) => {
                setFormData((prev) => ({
                  ...prev,
                  courseCode: value?.courseCode || "",
                  courseTitle: value?.courseTitle || "",
                }));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Course Code"
                  variant="outlined"
                  fullWidth
                />
              )}
              isOptionEqualToValue={(option, value) => option._id === value._id}
            />
          </Grid>

          <Grid item xs={6}>
            <Autocomplete
              options={rooms}
              getOptionLabel={(option) => option.name}
              onChange={(_, value) => {
                setFormData((prev) => ({
                  ...prev,
                  room: value?.name || "",
                }));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Room"
                  variant="outlined"
                  fullWidth
                />
              )}
              isOptionEqualToValue={(option, value) => option._id === value._id}
            />
          </Grid>

          <Grid item xs={6}>
            <Autocomplete
              options={sections}
              getOptionLabel={(option) =>
                `${option.course} - ${option.section}${option.block}`
              }
              onChange={(_, value) => {
                setFormData((prev) => ({
                  ...prev,
                  section: value?._id || "",
                }));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Section"
                  variant="outlined"
                  fullWidth
                />
              )}
              isOptionEqualToValue={(option, value) => option._id === value._id}
            />
          </Grid>
          <Grid item xs={12}>
            <Autocomplete
              options={faculty ? [faculty] : []} // only current user
              getOptionLabel={(option) => {
                const middleInitial = option.middle_name
                  ? option.middle_name.charAt(0).toUpperCase() + "."
                  : "";
                return `${option.last_name}, ${option.first_name} ${middleInitial}`;
              }}
              value={faculty || null} // set to current user or null
              onChange={(_, value) => {
                // no need to change because it's disabled, but you can keep this or remove
                setFormData((prev) => ({
                  ...prev,
                  instructor: value?._id || "",
                }));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Instructor"
                  variant="outlined"
                  fullWidth
                  disabled // disable typing and dropdown
                />
              )}
              disableClearable // disables clear (X) button
              popupIcon={null} // hide dropdown arrow icon
            />
          </Grid>
          <Grid item xs={12}>
            <Autocomplete
              options={semesters} // now an array
              value={selectedSemester}
              getOptionLabel={(option) =>
                `${option.semesterName} - AY ${option.academicYear}`
              }
              onChange={(_, value) => {
                setFormData((prev) => ({
                  ...prev,
                  semesterStartDate: value?.startDate || "",
                  semesterEndDate: value?.endDate || "",
                }));
              }}
              isOptionEqualToValue={(option, value) =>
                option.semesterName === value.semesterName &&
                option.academicYear === value.academicYear
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Semester"
                  variant="outlined"
                  fullWidth
                />
              )}
            />
          </Grid>

          <Grid item xs={6}>
            <TextField
              label="Start Time"
              name="startTime"
              type="time"
              fullWidth
              onChange={handleChange}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="End Time"
              name="endTime"
              type="time"
              fullWidth
              onChange={handleChange}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12}>
            <label>Days:</label>
            <div>
              {["mon", "tue", "wed", "thu", "fri", "sat"].map((day) => (
                <FormControlLabel
                  key={day}
                  control={
                    <Checkbox
                      checked={formData.days[day as keyof typeof formData.days]}
                      onChange={handleDayChange}
                      name={day}
                    />
                  }
                  label={day.toUpperCase()}
                />
              ))}
            </div>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={loading} // disable while loading
        >
          {loading ? "Submitting..." : "Submit"} {/* show text */}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddManualSchedule;
