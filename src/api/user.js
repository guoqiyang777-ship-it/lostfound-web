import request from '../utils/request';

// 用户注册
export function register(data) {
  return request({
    url: '/user/register',
    method: 'post',
    data
  });
}

// 用户登录
export function login(data) {
  return request({
    url: '/user/login',
    method: 'post',
    data
  });
}

// 获取验证码
export function getCaptcha() {
  return request({
    url: '/user/captcha',
    method: 'get'
  });
}

// 获取用户信息
export function getUserInfo() {
  return request({
    url: '/user/info',
    method: 'get'
  });
}

// 根据用户ID获取用户信息
export function getUserInfoById(id) {
  return request({
    url: `/user/info/${id}`,
    method: 'get'
  });
}

// 更新用户信息
export function updateUserInfo(data) {
  return request({
    url: '/user/info',
    method: 'put',
    data
  });
}

// 更新用户头像
export function updateAvatar(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  return request({
    url: '/user/avatar',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
}

// 更新用户密码
export function updatePassword(oldPassword, newPassword) {
  return request({
    url: '/user/password',
    method: 'put',
    params: {
      oldPassword,
      newPassword
    }
  });
}

// 获取用户仪表盘数据
export function getUserDashboard() {
  return request({
    url: '/item/user/dashboard',
    method: 'get'
  });
}

// 用户退出登录
export function logout() {
  return request({
    url: '/user/logout',
    method: 'post'
  });
}