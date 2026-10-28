terraform {
  required_version = ">= 1.5.0"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.140"
    }
  }
}
provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
  zone      = var.zone
}
variable "cloud_id" { type = string }
variable "folder_id" { type = string }
variable "zone" {
  type    = string
  default = "ru-central1-a"
}
variable "admin_cidr" {
  type        = string
  description = "Trusted public IPv4 address with /32 for SSH."
  validation {
    condition     = can(cidrhost(var.admin_cidr, 0)) && endswith(var.admin_cidr, "/32")
    error_message = "Set one trusted IPv4 address with /32."
  }
}
variable "ssh_public_key" { type = string }
data "yandex_compute_image" "ubuntu" { family = "ubuntu-2404-lts" }
resource "yandex_vpc_network" "taxi" { name = "taxi-network" }
resource "yandex_vpc_subnet" "taxi" {
  name           = "taxi-subnet"
  zone           = var.zone
  network_id     = yandex_vpc_network.taxi.id
  v4_cidr_blocks = ["10.80.0.0/24"]
}
resource "yandex_vpc_security_group" "taxi" {
  name       = "taxi-web"
  network_id = yandex_vpc_network.taxi.id
  ingress {
    protocol       = "TCP"
    port           = 22
    v4_cidr_blocks = [var.admin_cidr]
  }
  ingress {
    protocol       = "TCP"
    port           = 80
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    protocol       = "TCP"
    port           = 443
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "yandex_compute_instance" "taxi" {
  name        = "taxi-demo"
  platform_id = "standard-v3"
  resources {
    cores  = 2
    memory = 4
  }
  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.ubuntu.id
      size     = 30
    }
  }
  network_interface {
    subnet_id          = yandex_vpc_subnet.taxi.id
    nat                = true
    security_group_ids = [yandex_vpc_security_group.taxi.id]
  }
  metadata = {
    ssh-keys = "ubuntu:${var.ssh_public_key}"
  }
}
output "public_ip" { value = yandex_compute_instance.taxi.network_interface[0].nat_ip_address }
