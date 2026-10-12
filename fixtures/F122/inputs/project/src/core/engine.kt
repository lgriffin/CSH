package shop.core

import shop.web.Server

class Engine(private val server: Server) {
    fun start() = server.listen(8080)
}
