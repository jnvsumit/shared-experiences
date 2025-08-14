import axios from 'axios'
import { CONFIG } from '../config'

export const api = axios.create({ baseURL: CONFIG.apiBase, withCredentials: true })


