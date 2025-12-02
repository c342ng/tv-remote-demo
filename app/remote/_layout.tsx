import { Stack } from 'expo-router';

export default function RemoteLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="discovery" />
      <Stack.Screen name="control" />
    </Stack>
  );
}
