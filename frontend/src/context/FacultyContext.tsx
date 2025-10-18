import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import axios from "axios";

interface Faculty {
  _id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  status: string;
  profilePhotoUrl?: string;
}

interface FacultyContextType {
  facultyList: Faculty[];
  setFacultyList: React.Dispatch<React.SetStateAction<Faculty[]>>;
}

const FacultyContext = createContext<FacultyContextType | undefined>(undefined);

export const FacultyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);

  useEffect(() => {
    const fetchFaculty = async () => {
      try {
        const CourseName = localStorage.getItem("course") ?? "";
  
        const res = await axios.get("https://eduvision-dura.onrender.com/api/auth/faculty", {
          params: { courseName: CourseName },
        });
  
        setFacultyList(res.data);
      } catch (error) {
        console.error("Error fetching faculty data:", error);
      }
    };
  
    fetchFaculty();
  }, []);
  

  return (
    <FacultyContext.Provider value={{ facultyList, setFacultyList }}>
      {children}
    </FacultyContext.Provider>
  );
};

export const useFacultyContext = () => {
  const context = useContext(FacultyContext);
  if (!context) {
    throw new Error("useFacultyContext must be used within a FacultyProvider");
  }
  return context;
};
