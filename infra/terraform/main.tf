resource "proxmox_virtual_environment_vm" "nodes" {
  for_each = var.virtual_machines

  agent {
    enabled = true
    timeout = "2m"
  }

  name      = each.key
  vm_id     = each.value.id
  node_name = "homelab"

  cpu {
    cores = each.value.cores
  }

  memory {
    dedicated = each.value.memory
  }

  clone {
    vm_id = 9000
  }

  disk {
    datastore_id = "local"
    interface    = "scsi0"
    size         = each.value.size
  }

  network_device {
    bridge = "vmbr0"
  }

  initialization {
    datastore_id = "local"

    ip_config {
      ipv4 {
        address = each.value.ip
        gateway = "192.168.1.254"
      }
    }

    user_account {
      keys = [file("~/.ssh/id_rsa.pub")]
    }
  }
}
