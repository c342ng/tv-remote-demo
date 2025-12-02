import { Redirect } from 'expo-router';

export default function Index() {
  // 入口直接跳转到遥控器控制页面
  return <Redirect href="/remote/control" />;
}
