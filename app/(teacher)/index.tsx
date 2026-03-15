import { Redirect } from 'expo-router';

export default function TeacherHomeRedirect() {
  return <Redirect href="/(teacher)/classes" />;
}
